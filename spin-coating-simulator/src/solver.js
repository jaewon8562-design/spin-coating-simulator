// EBP Spin Coating Numerical Solver
// Govering eq: dh/dt = -(rho*omega^2)/(3*eta(t)) * (1/r) * d(r*h^3)/dr - E
// RK2 time integration + central difference spatial discretization

const RHO = 1100;           // density kg/m^3
const ETA_GEL_FACTOR = 50;  // gel threshold: eta = 50 * eta0

export function runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, N = 100, t_final = 30 }) {
  // Unit conversions
  const omega = (omega_rpm * 2 * Math.PI) / 60;  // rad/s
  const eta0  = eta0_cP * 1e-3;                   // Pa·s
  const h0    = h0_um * 1e-6;                     // m
  const E     = E_um_s * 1e-6;                    // m/s
  const R     = R_mm * 1e-3;                      // m
  const eta_gel = eta0 * ETA_GEL_FACTOR;

  // Grid: avoid r=0 singularity by offsetting
  const dr = R / N;
  const r  = Array.from({ length: N }, (_, i) => (i + 0.5) * dr);

  // Initialize uniform film
  let h = new Float64Array(N).fill(h0);
  let t = 0;
  let t_gel = null;

  const snapshots = [];
  let last_snap = -1;

  const getEta = (time) => eta0 * Math.exp(beta * E * time);

  // Correct EBP RHS: dh/dt = -(rho*omega^2)/(3*eta) * (1/r) * d(r*h^3)/dr - E
  const computeRHS = (h_arr, time) => {
    const eta = getEta(time);
    const coeff = (RHO * omega * omega) / (3.0 * eta);
    const rhs = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      // Compute flux F = r * h^3 at half-points using upwind
      // F_{i+1/2} and F_{i-1/2}
      let F_plus, F_minus;

      if (i < N - 1) {
        const r_half_p = 0.5 * (r[i] + r[i+1]);
        const h_half_p = 0.5 * (h_arr[i] + h_arr[i+1]);
        F_plus = r_half_p * Math.pow(h_half_p, 3);
      } else {
        // Outer BC: free drain - extrapolate
        F_plus = r[i] * Math.pow(h_arr[i], 3);
      }

      if (i > 0) {
        const r_half_m = 0.5 * (r[i-1] + r[i]);
        const h_half_m = 0.5 * (h_arr[i-1] + h_arr[i]);
        F_minus = r_half_m * Math.pow(h_half_m, 3);
      } else {
        // Inner BC: symmetry - flux = 0 at r=0
        F_minus = 0;
      }

      // (1/r) * dF/dr using finite volume
      const dFdr = (F_plus - F_minus) / dr;
      rhs[i] = -coeff * dFdr / r[i] - E;
    }
    return rhs;
  };

  // Emslie analytical solution (E=0, uniform film)
  const emslieH = (time) => {
    const alpha = (4.0 * RHO * omega * omega * h0 * h0) / (3.0 * eta0);
    return h0 / Math.sqrt(1.0 + alpha * time);
  };

  // Main time integration loop
  const maxSteps = 200000;
  let step = 0;

  while (t < t_final && step < maxSteps) {
    const eta_t = getEta(t);
    const h_max = Math.max(...h);
    if (h_max <= 1e-15) break;

    // Adaptive CFL time step
    const D = (RHO * omega * omega * h_max * h_max) / (3.0 * eta_t);
    const dt_cfl = D > 1e-20 ? 0.3 * dr * dr / (2.0 * D) : 1.0;
    const dt = Math.min(dt_cfl, 0.1, t_final - t);
    if (dt <= 0) break;

    // RK2
    const k1 = computeRHS(h, t);
    const h_tmp = h.map((hi, i) => Math.max(hi + dt * k1[i], 0));
    const k2 = computeRHS(h_tmp, t + dt);
    h = h.map((hi, i) => Math.max(hi + (dt / 2.0) * (k1[i] + k2[i]), 0));

    t += dt;
    step++;

    // Check gel time
    if (t_gel === null && getEta(t) >= eta_gel) {
      t_gel = t;
    }

    // Save snapshot every 0.5s
    const snap_idx = Math.floor(t / 0.5);
    if (snap_idx > last_snap) {
      last_snap = snap_idx;
      const h_um = Array.from(h).map(v => v * 1e6);
      const mean_h = h_um.reduce((a, b) => a + b, 0) / N;
      const std_h  = Math.sqrt(h_um.reduce((a, b) => a + (b - mean_h) ** 2, 0) / N);
      const uniformity = mean_h > 1e-6 ? (std_h / mean_h) * 100 : 0;
      snapshots.push({
        t: parseFloat(t.toFixed(2)),
        h: h_um.map(v => parseFloat(v.toFixed(4))),
        r: r.map(v => parseFloat((v * 1e3).toFixed(2))),
        uniformity: parseFloat(uniformity.toFixed(3)),
        eta: parseFloat((getEta(t) * 1e3).toFixed(1)),
      });
    }
  }

  // Final statistics
  const h_final_um = Array.from(h).map(v => v * 1e6);
  const mean_final = h_final_um.reduce((a, b) => a + b, 0) / N;
  const std_final  = Math.sqrt(h_final_um.reduce((a, b) => a + (b - mean_final) ** 2, 0) / N);
  const uniformity_final = mean_final > 1e-6 ? (std_final / mean_final) * 100 : 0;

  // Emslie validation curve
  const validation = Array.from({ length: 50 }, (_, i) => {
    const tv = (i / 49) * t_final;
    return {
      t: parseFloat(tv.toFixed(2)),
      h_emslie: parseFloat((emslieH(tv) * 1e6).toFixed(4))
    };
  });

  return {
    snapshots,
    r_mm: r.map(v => parseFloat((v * 1e3).toFixed(2))),
    h_final: h_final_um.map(v => parseFloat(v.toFixed(4))),
    uniformity_final: parseFloat(uniformity_final.toFixed(3)),
    mean_final: parseFloat(mean_final.toFixed(4)),
    t_gel: t_gel ? parseFloat(t_gel.toFixed(2)) : null,
    validation,
    t_total: parseFloat(t.toFixed(2)),
  };
}

// Parameter sweep for design exploration heatmap
export function runSweep({ omega_range, eta_range, h0_um, E_um_s, beta, R_mm }) {
  const results = [];
  for (const omega_rpm of omega_range) {
    const row = [];
    for (const eta0_cP of eta_range) {
      const res = runSimulation({
        omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm,
        N: 60, t_final: 20
      });
      row.push({
        omega_rpm,
        eta0_cP,
        uniformity: res.uniformity_final,
        h_final: res.mean_final,
        t_gel: res.t_gel,
        meets_spec: res.uniformity_final <= 2.0,
      });
    }
    results.push(row);
  }
  return results;
}

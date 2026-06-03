// EBP Spin Coating Numerical Solver
// Solves: dh/dt = -(rho*omega^2 / 3*eta(t)) * (1/r) * d(r^2 * h^3)/dr - E
// using RK2 time integration with central difference spatial discretization

const RHO = 1100;      // density kg/m^3
const ETA_GEL_FACTOR = 100; // gel when eta = 100 * eta0

export function runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, N = 100, t_final = 30 }) {
  // Unit conversions
  const omega = (omega_rpm * 2 * Math.PI) / 60;   // rad/s
  const eta0  = eta0_cP * 1e-3;                    // Pa·s
  const h0    = h0_um * 1e-6;                      // m
  const E     = E_um_s * 1e-6;                     // m/s
  const R     = R_mm * 1e-3;                       // m
  const eta_gel = eta0 * ETA_GEL_FACTOR;

  // Grid
  const dr = R / (N - 1);
  const r  = Array.from({ length: N }, (_, i) => i * dr);

  // Initialize
  let h = new Float64Array(N).fill(h0);
  let t = 0;
  let t_gel = null;

  // Store snapshots: every ~0.5s
  const snapshots = [];
  let last_snap = -1;

  const getEta = (time) => eta0 * Math.exp(beta * E * time);

  // RHS evaluation
  const computeRHS = (h_arr, time) => {
    const eta = getEta(time);
    const rhs = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      let flux_grad;

      if (i === 0) {
        // Symmetry BC: ghost point h[-1] = h[1]
        const fp1 = r[1]  * r[1]  * h_arr[1]  ** 3;
        const fm1 = r[1]  * r[1]  * h_arr[1]  ** 3; // ghost
        flux_grad = (fp1 - fm1) / (2 * dr);
        rhs[i] = -(RHO * omega ** 2) / (3 * eta) * (i === 0 ? 0 : flux_grad / r[i]) - E;
      } else if (i === N - 1) {
        // Free drain BC: ghost point h[N] = h[N-2]
        const fp1 = r[i]    * r[i]    * h_arr[i]    ** 3;
        const fm1 = r[i-1]  * r[i-1]  * h_arr[i-1]  ** 3;
        flux_grad = (fp1 - fm1) / dr;
        rhs[i] = -(RHO * omega ** 2) / (3 * eta) * flux_grad / r[i] - E;
      } else {
        const fp1 = r[i+1] * r[i+1] * h_arr[i+1] ** 3;
        const fm1 = r[i-1] * r[i-1] * h_arr[i-1] ** 3;
        flux_grad = (fp1 - fm1) / (2 * dr);
        rhs[i] = -(RHO * omega ** 2) / (3 * eta) * flux_grad / r[i] - E;
      }
    }
    return rhs;
  };

  // Emslie analytical solution (E=0 limit)
  const emslieH = (time) => {
    const alpha = (4 * RHO * omega ** 2 * h0 ** 2) / (3 * eta0);
    return h0 / Math.sqrt(1 + alpha * time);
  };

  // Main loop
  const maxSteps = 50000;
  let step = 0;

  while (t < t_final && step < maxSteps) {
    const eta_t = getEta(t);
    const h_max = Math.max(...h);
    if (h_max <= 0) break;

    // CFL time step
    const D = (RHO * omega ** 2 * h_max ** 2) / (3 * eta_t);
    const dt_cfl = D > 0 ? 0.4 * dr ** 2 / (2 * D) : 0.1;
    const dt = Math.min(dt_cfl, 0.05, t_final - t);

    // RK2
    const k1 = computeRHS(h, t);
    const h_tmp = h.map((hi, i) => Math.max(hi + dt * k1[i], 1e-12));
    const k2 = computeRHS(h_tmp, t + dt);
    h = h.map((hi, i) => Math.max(hi + (dt / 2) * (k1[i] + k2[i]), 1e-12));

    t += dt;
    step++;

    // Gel time
    if (t_gel === null && getEta(t) >= eta_gel) {
      t_gel = t;
    }

    // Snapshot every 0.5s
    const snap_idx = Math.floor(t / 0.5);
    if (snap_idx > last_snap) {
      last_snap = snap_idx;
      const h_um = Array.from(h).map(v => v * 1e6);
      const mean_h = h_um.reduce((a, b) => a + b, 0) / N;
      const std_h  = Math.sqrt(h_um.reduce((a, b) => a + (b - mean_h) ** 2, 0) / N);
      const uniformity = mean_h > 0 ? (std_h / mean_h) * 100 : 0;
      snapshots.push({
        t: parseFloat(t.toFixed(2)),
        h: h_um.map(v => parseFloat(v.toFixed(4))),
        r: r.map(v => parseFloat((v * 1e3).toFixed(2))),  // mm
        uniformity: parseFloat(uniformity.toFixed(3)),
        eta: parseFloat((getEta(t) * 1e3).toFixed(1)),    // cP
      });
    }
  }

  // Final profile
  const h_final_um = Array.from(h).map(v => v * 1e6);
  const mean_final = h_final_um.reduce((a, b) => a + b, 0) / N;
  const std_final  = Math.sqrt(h_final_um.reduce((a, b) => a + (b - mean_final) ** 2, 0) / N);
  const uniformity_final = mean_final > 0 ? (std_final / mean_final) * 100 : 0;

  // Emslie validation (E=0 comparison)
  const validation = Array.from({ length: 50 }, (_, i) => {
    const tv = (i / 49) * t_final;
    return { t: parseFloat(tv.toFixed(2)), h_emslie: parseFloat((emslieH(tv) * 1e6).toFixed(4)) };
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

// Parameter sweep for design exploration (ω vs η₀ heatmap)
export function runSweep({ omega_range, eta_range, h0_um, E_um_s, beta, R_mm }) {
  const results = [];
  for (const omega_rpm of omega_range) {
    const row = [];
    for (const eta0_cP of eta_range) {
      const res = runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, N: 50, t_final: 20 });
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

// EBP Spin Coating Solver
// 1D ODE: dh/dt = -(2*rho*omega^2/3*eta(t))*h^3 - E  [Emslie 1958]
// Viscosity: eta(t) = eta0 * exp(beta*E*t)            [Meyerhofer 1978]
// Spatial profile: h(r,t) via perturbation on top of 1D solution

const RHO = 1100;

export function runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, N = 80, t_final = 25 }) {
  const omega = (omega_rpm * 2 * Math.PI) / 60;
  const eta0  = eta0_cP * 1e-3;
  const h0    = h0_um * 1e-6;
  const E     = E_um_s * 1e-6;
  const R     = R_mm * 1e-3;
  const eta_gel = eta0 * 50;

  const r_arr = Array.from({ length: N }, (_, i) => (i / (N - 1)) * R);
  const getEta = (t) => eta0 * Math.exp(beta * E * t);

  // 1D center ODE (RK4 for accuracy)
  const dhdt = (h_val, t_val) => {
    const eta = getEta(t_val);
    return -(2 * RHO * omega * omega / (3 * eta)) * h_val ** 3 - E;
  };

  // Build time series with small dt
  let h_center = h0;
  let t = 0;
  let t_gel = null;
  const snapshots = [];
  let last_snap = -1;
  const dt_base = 0.005;

  while (t < t_final) {
    const dt = Math.min(dt_base, t_final - t);
    if (dt <= 0) break;

    // RK4
    const k1 = dhdt(h_center, t);
    const k2 = dhdt(h_center + 0.5*dt*k1, t + 0.5*dt);
    const k3 = dhdt(h_center + 0.5*dt*k2, t + 0.5*dt);
    const k4 = dhdt(h_center + dt*k3, t + dt);
    h_center = Math.max(h_center + (dt/6)*(k1 + 2*k2 + 2*k3 + k4), 0);
    t += dt;

    if (t_gel === null && getEta(t) >= eta_gel) t_gel = t;

    // Spatial profile: h(r,t) = h_center(t) * f(r,t)
    // Edge bead: f(r) = 1 + A(t) * (r/R)^n
    // A grows with time as film thins and edge accumulates
    const snap_idx = Math.floor(t / 0.5);
    if (snap_idx > last_snap) {
      last_snap = snap_idx;

      // Edge bead amplitude: grows as centrifugal flux accumulates at edge
      // A(t) ~ (omega^2 * h_center^2 * t) / (eta * R)  normalized
      const A = Math.min(0.4 * (RHO * omega * omega * h_center * h_center * t) / (getEta(t) * R * 2000), 0.8);
      const n = 4;
      const h_profile = r_arr.map(ri => {
        const f = 1 + A * Math.pow(ri / R, n);
        return Math.max(h_center * f * 1e6, 0);
      });

      const mean_h = h_profile.reduce((a, b) => a + b, 0) / N;
      const std_h  = Math.sqrt(h_profile.reduce((a, b) => a + (b - mean_h) ** 2, 0) / N);
      const sigma  = mean_h > 1e-6 ? (std_h / mean_h) * 100 : 0;

      snapshots.push({
        t: parseFloat(t.toFixed(2)),
        h: h_profile.map(v => parseFloat(v.toFixed(4))),
        r: r_arr.map(v => parseFloat((v * 1e3).toFixed(2))),
        uniformity: parseFloat(sigma.toFixed(3)),
        eta: parseFloat((getEta(t) * 1e3).toFixed(1)),
      });
    }
  }

  // Final profile
  const A_final = Math.min(0.4 * (RHO * omega * omega * h_center * h_center * t_final) / (getEta(t_final) * R * 2000), 0.8);
  const h_final = r_arr.map(ri => Math.max(h_center * (1 + A_final * Math.pow(ri/R, 4)) * 1e6, 0));
  const mean_f = h_final.reduce((a, b) => a + b, 0) / N;
  const std_f  = Math.sqrt(h_final.reduce((a, b) => a + (b - mean_f) ** 2, 0) / N);
  const sigma_f = mean_f > 1e-6 ? (std_f / mean_f) * 100 : 0;

  // Emslie analytical (E=0)
  const alpha = (4 * RHO * omega * omega * h0 * h0) / (3 * eta0);
  const validation = Array.from({ length: 50 }, (_, i) => {
    const tv = (i / 49) * t_final;
    return {
      t: parseFloat(tv.toFixed(2)),
      h_emslie: parseFloat((h0 / Math.sqrt(1 + alpha * tv) * 1e6).toFixed(4))
    };
  });

  return {
    snapshots,
    r_mm: r_arr.map(v => parseFloat((v * 1e3).toFixed(2))),
    h_final: h_final.map(v => parseFloat(v.toFixed(4))),
    uniformity_final: parseFloat(sigma_f.toFixed(3)),
    mean_final: parseFloat(mean_f.toFixed(4)),
    h_center_final: parseFloat((h_center * 1e6).toFixed(4)),
    t_gel: t_gel ? parseFloat(t_gel.toFixed(2)) : null,
    validation,
    t_total: parseFloat(t.toFixed(2)),
  };
}

export function runSweep({ omega_range, eta_range, h0_um, E_um_s, beta, R_mm }) {
  const results = [];
  for (const omega_rpm of omega_range) {
    const row = [];
    for (const eta0_cP of eta_range) {
      const res = runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, t_final: 20 });
      row.push({
        omega_rpm, eta0_cP,
        uniformity: res.uniformity_final,
        h_final: res.h_center_final,
        t_gel: res.t_gel,
        meets_spec: res.uniformity_final <= 2.0,
      });
    }
    results.push(row);
  }
  return results;
}

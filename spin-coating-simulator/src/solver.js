// EBP Spin Coating Numerical Solver
// dh/dt = -(rho*omega^2)/(3*eta(t)) * (1/r) * d(r*h^3)/dr - E

const RHO = 1100;
const ETA_GEL_FACTOR = 50;

export function runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, N = 80, t_final = 25 }) {
  const omega = (omega_rpm * 2 * Math.PI) / 60;
  const eta0  = eta0_cP * 1e-3;
  const h0    = h0_um * 1e-6;
  const E     = E_um_s * 1e-6;
  const R     = R_mm * 1e-3;
  const eta_gel = eta0 * ETA_GEL_FACTOR;

  // cell-centered grid, avoids r=0 singularity
  const dr = R / N;
  const r  = Array.from({ length: N }, (_, i) => (i + 0.5) * dr);

  let h = Array.from({ length: N }, () => h0);
  let t = 0;
  let t_gel = null;
  const snapshots = [];
  let last_snap = -1;

  const getEta = (time) => eta0 * Math.exp(beta * E * time);

  // RHS using finite-volume: (1/r)*d(r*h^3)/dr
  // flux at cell face i+1/2: F = r_{i+1/2} * h_{i+1/2}^3
  const computeRHS = (h_arr, time) => {
    const eta = getEta(time);
    const C = (RHO * omega * omega) / (3.0 * eta);
    const rhs = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      // right face flux
      let Fp;
      if (i < N - 1) {
        const rp = r[i] + 0.5 * dr;
        const hp = 0.5 * (h_arr[i] + h_arr[i + 1]);
        Fp = rp * hp * hp * hp;
      } else {
        // outflow BC: same as interior
        const rp = r[i] + 0.5 * dr;
        Fp = rp * h_arr[i] * h_arr[i] * h_arr[i];
      }

      // left face flux
      let Fm;
      if (i > 0) {
        const rm = r[i] - 0.5 * dr;
        const hm = 0.5 * (h_arr[i - 1] + h_arr[i]);
        Fm = rm * hm * hm * hm;
      } else {
        // symmetry BC: zero flux at r=0
        Fm = 0;
      }

      // (1/r) * (Fp - Fm) / dr
      rhs[i] = -C * (Fp - Fm) / (r[i] * dr) - E;
    }
    return rhs;
  };

  const emslieH = (time) => {
    const alpha = (4.0 * RHO * omega * omega * h0 * h0) / (3.0 * eta0);
    return h0 / Math.sqrt(1.0 + alpha * time);
  };

  let step = 0;
  const maxSteps = 500000;

  while (t < t_final && step < maxSteps) {
    const eta_t = getEta(t);
    const h_max = Math.max(...h);
    if (h_max <= 0) break;

    // adaptive dt from CFL
    const D = (RHO * omega * omega * h_max * h_max) / (3.0 * eta_t);
    let dt;
    if (D > 0) {
      dt = Math.min(0.3 * dr * dr / (2.0 * D), 0.05, t_final - t);
    } else {
      dt = Math.min(0.05, t_final - t);
    }
    if (dt <= 1e-10) break;

    // RK2
    const k1 = computeRHS(h, t);
    const h1 = h.map((hi, i) => Math.max(hi + dt * k1[i], 0));
    const k2 = computeRHS(h1, t + dt);
    h = h.map((hi, i) => Math.max(hi + 0.5 * dt * (k1[i] + k2[i]), 0));

    t += dt;
    step++;

    if (t_gel === null && getEta(t) >= eta_gel) t_gel = t;

    const snap_idx = Math.floor(t / 0.5);
    if (snap_idx > last_snap) {
      last_snap = snap_idx;
      const h_um = h.map(v => v * 1e6);
      const mean_h = h_um.reduce((a, b) => a + b, 0) / N;
      const std_h = Math.sqrt(h_um.reduce((a, b) => a + (b - mean_h) ** 2, 0) / N);
      snapshots.push({
        t: parseFloat(t.toFixed(2)),
        h: h_um.map(v => parseFloat(v.toFixed(4))),
        r: r.map(v => parseFloat((v * 1e3).toFixed(2))),
        uniformity: parseFloat((mean_h > 1e-6 ? (std_h / mean_h) * 100 : 0).toFixed(3)),
        eta: parseFloat((getEta(t) * 1e3).toFixed(1)),
      });
    }
  }

  const h_final_um = h.map(v => v * 1e6);
  const mean_f = h_final_um.reduce((a, b) => a + b, 0) / N;
  const std_f  = Math.sqrt(h_final_um.reduce((a, b) => a + (b - mean_f) ** 2, 0) / N);

  const validation = Array.from({ length: 50 }, (_, i) => {
    const tv = (i / 49) * t_final;
    return { t: parseFloat(tv.toFixed(2)), h_emslie: parseFloat((emslieH(tv) * 1e6).toFixed(4)) };
  });

  return {
    snapshots,
    r_mm: r.map(v => parseFloat((v * 1e3).toFixed(2))),
    h_final: h_final_um.map(v => parseFloat(v.toFixed(4))),
    uniformity_final: parseFloat((mean_f > 1e-6 ? (std_f / mean_f) * 100 : 0).toFixed(3)),
    mean_final: parseFloat(mean_f.toFixed(4)),
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
      const res = runSimulation({ omega_rpm, eta0_cP, h0_um, E_um_s, beta, R_mm, N: 50, t_final: 20 });
      row.push({
        omega_rpm, eta0_cP,
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

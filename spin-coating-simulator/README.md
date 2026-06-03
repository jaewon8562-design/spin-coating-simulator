# Spin Coating Thin-Film Simulator

**SKKU Fluid Mechanics Term Project — Subject 1**
Emslie–Bonner–Peck Theory + Meyerhofer Evaporation Model

## Overview

This web-based simulator solves the EBP governing equation for photoresist spin coating:

$$\frac{\partial h}{\partial t} = -\frac{\rho\omega^2}{3\eta(t)}\frac{1}{r}\frac{\partial}{\partial r}\left(r^2 h^3\right) - E$$

using a 2nd-order Runge–Kutta (RK2) numerical solver with adaptive time stepping.

## Features

- **Interactive Mode**: Real-time h(r,t) animation with 5 parameter sliders
- **Validation View**: Numerical solution vs Emslie analytical solution (E=0 limit)
- **Design Exploration**: (ω, η₀) parameter sweep heatmap for ±2% uniformity spec

## Tech Stack

- Vite + React 18
- Recharts (visualization)
- Pure JS numerical solver (no external math library)

## Getting Started

```bash
npm install
npm run dev
```

## Deploy

Deployed on Vercel: [link]

## References

1. Emslie, A.G., Bonner, F.T., Peck, L.G. (1958). J. Appl. Phys. 29(5), 858–862.
2. Meyerhofer, D. (1978). J. Appl. Phys. 49(7), 3993–3997.

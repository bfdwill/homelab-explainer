# Plan: Interactive Home Lab Network Explainer

A static Vite + TypeScript app (no framework, no other runtime deps) that explains the
home lab by letting you flip switches and watch packets move. Hosted on Vercel.

## Shared facts (everyone uses these exact values)

| Thing | Value |
|---|---|
| Modem | ARRIS cable modem, pure modem (no routing). Public IP lands on OPNsense WAN |
| WAN (example) | `203.0.113.45` via ISP DHCP (documentation range, not my real IP) |
| Proxmox host | mini PC. Built-in NIC → `vmbr0` (LAN). USB NIC → `vmbr1` (WAN) |
| OPNsense VM | `vtnet0` = LAN on vmbr0, `vtnet1` = WAN on vmbr1 |
| LAN | `192.168.1.0/24`, OPNsense `192.168.1.1`, switch mgmt `192.168.1.3`, PC `192.168.1.50` |
| Orbi | yellow cable to `Gi1/0/2`. AP mode: `192.168.1.2`. Router mode: WAN `192.168.1.2`, own LAN `10.0.0.0/24` (gateway `10.0.0.1`) |
| Switch | Cisco Catalyst 3650-24PS (WS-C3650-24PS). Uplink `Gi1/0/1`, Orbi `Gi1/0/2`, PC `Gi1/0/4` (grey), tent hub `Gi1/0/10` |
| IoT VLAN | VLAN 30 `IOT`, `192.168.30.0/24`, gateway `192.168.30.1` (OPNsense `vtnet0.30`), tent hub `192.168.30.20` |

## File structure

```
index.html              app shell mount                         (C)
vercel.json             static deploy config                    (lead)
src/types.ts            shared contract (types + Stage API)     (lead)
src/main.ts             bootstraps shell, stage, lessons        (C)
src/progress.ts         localStorage progress                   (C)
src/ui/                 lesson list, controls, panel, status    (C)
src/styles.css          global layout + theme + mobile          (C)
src/topology.ts         node/link/frame geometry                (A)
src/stage/              SVG renderer + packet animation engine  (A)
src/lessons/*.ts        one declarative object per lesson       (B)
src/lessons/index.ts    ordered lesson registry                 (B)
src/content/devices.ts  base DeviceInfo per node                (B)
src/content/snippets.ts canonical OPNsense / IOS / Proxmox configs (D)
README.md, docs/        README, diagram, screenshot             (D, lead adds screenshot)
```

## Data flow

`lesson.solve({ params, action })` → `SolveResult { links, nodes, flows, status, details }`
→ `stage.render(result)` animates flows along topology paths; the shell shows `status`.
Clicking a node → side panel = `devices[id]` + `lesson.deviceNotes[id]`.
Nothing lesson-specific lives outside `src/lessons/*.ts`.

## Workstreams (run in parallel)

- **A: Stage.** `topology.ts`, `src/stage/`. SVG nodes/links/frames, link up/down,
  node states, packet animation (Web Animations API) along `flow.path`, NAT badges,
  blocked packets turn red and stop at the last node with the `reason`.
- **B: Lessons.** The 4 lessons (core path, Orbi down, double NAT, IoT VLAN) with
  `solve()` logic, and `devices.ts`. Uses snippets by key from `snippets.ts`.
- **C: UI shell.** Lesson list, param toggles, action buttons, status bar, device side
  panel, mobile layout, localStorage progress (visited lessons + last lesson).
- **D: Content accuracy.** Writes and reviews `snippets.ts` (OPNsense, Cisco IOS XE,
  Proxmox), then the README with a Mermaid diagram and Vercel deploy steps.

## Integration (lead)

Wire the parts together, run `npm run build`, fix errors, check every lesson in a headless
browser, take the README screenshot, commit per workstream, and open the PR.

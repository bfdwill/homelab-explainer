import type { Topology } from './types';

/**
 * Geometry of the home lab, in SVG user units (viewBox 1040 x 640; the stage crops it to the visible devices).
 *
 * Row 1 (y=90):  Internet → Modem → [Proxmox mini PC: OPNsense]
 * Row 2 (y=270): Catalyst switch (under OPNsense)
 * Row 3 (y=440): Orbi, PC, Tent hub (fanned out from the switch)
 * Row 4 (y=580): Laptop (WiFi, under the Orbi), tent sensor / fan / light
 */
export const topology: Topology = {
  nodes: [
    { id: 'internet', label: 'Internet', sublabel: 'ISP', kind: 'cloud', x: 78, y: 90 },
    { id: 'modem', label: 'Modem', sublabel: 'ARRIS', kind: 'modem', x: 290, y: 90 },
    { id: 'opnsense', label: 'OPNsense', sublabel: 'VM', kind: 'firewall', x: 660, y: 100 },
    { id: 'switch', label: 'Switch', sublabel: 'Catalyst 3650', kind: 'switch', x: 660, y: 270 },
    { id: 'orbi', label: 'WiFi', sublabel: 'Orbi', kind: 'ap', x: 290, y: 440 },
    { id: 'laptop', label: 'Laptop', sublabel: 'WiFi client', kind: 'client', x: 290, y: 580 },
    { id: 'pc', label: 'PC', sublabel: 'Desktop', kind: 'client', x: 660, y: 440 },
    { id: 'tent-hub', label: 'Tent hub', sublabel: 'Grow controller', kind: 'iot', x: 878, y: 440 },
    { id: 'tent-sensor', label: 'Sensor', sublabel: 'Temp/RH', kind: 'iot', x: 770, y: 580 },
    { id: 'tent-fan', label: 'Fan', sublabel: 'Exhaust', kind: 'iot', x: 878, y: 580 },
    { id: 'tent-light', label: 'Light', sublabel: 'LED', kind: 'iot', x: 986, y: 580 },
  ],
  links: [
    { id: 'coax', a: 'internet', b: 'modem', label: 'Coax', style: 'coax' },
    { id: 'wan', a: 'modem', b: 'opnsense', label: 'USB NIC → WAN', style: 'usb', labelAt: 0.455 },
    { id: 'lan', a: 'opnsense', b: 'switch', label: 'LAN → Gi1/0/1', style: 'copper' },
    { id: 'yellow', a: 'switch', b: 'orbi', label: 'Gi1/0/2', color: '#f2c200', style: 'copper' },
    { id: 'grey', a: 'switch', b: 'pc', label: 'Gi1/0/4', color: '#9aa0a6', style: 'copper' },
    { id: 'wifi', a: 'orbi', b: 'laptop', label: 'WiFi', style: 'wireless' },
    { id: 'tent', a: 'switch', b: 'tent-hub', label: 'Gi1/0/10', style: 'copper', labelAt: 0.7 },
    { id: 'tent-sensor', a: 'tent-hub', b: 'tent-sensor', style: 'copper' },
    { id: 'tent-fan', a: 'tent-hub', b: 'tent-fan', style: 'copper' },
    { id: 'tent-light', a: 'tent-hub', b: 'tent-light', style: 'copper' },
  ],
  frames: [{ id: 'proxmox', label: 'Proxmox mini PC', around: ['opnsense'] }],
};

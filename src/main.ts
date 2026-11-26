import './styles.css';
import { topology } from './topology';
import { createStage } from './stage';
import { lessons } from './lessons';
import { devices } from './content/devices';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (root) {
  mountApp(root, { topology, createStage, lessons, devices });
}

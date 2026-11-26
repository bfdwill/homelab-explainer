import type { Lesson } from '../types';
import { corePath } from './core-path';
import { orbiDown } from './orbi-down';
import { doubleNat } from './double-nat';
import { iotVlan } from './iot-vlan';

export const lessons: Lesson[] = [corePath, orbiDown, doubleNat, iotVlan];

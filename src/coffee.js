import * as THREE from 'three';
import { SETTINGS } from './config.js';

export function createCoffee() {
  const group = new THREE.Group();
  group.position.fromArray(SETTINGS.cupPosition);
  const ceramic = new THREE.MeshStandardMaterial({ color: '#e6ddc7', roughness: 0.22, metalness: 0.03 });
  const profile = [
    [0, 0.065], [0.28, 0.065], [0.32, 0.085], [0.36, 0.16],
    [0.405, 0.45], [0.44, 0.84], [0.444, 0.87], [0.435, 0.885],
    [0.41, 0.885], [0.397, 0.867], [0.393, 0.83], [0.36, 0.45],
    [0.31, 0.18], [0.26, 0.145], [0, 0.145],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ceramic);
  cup.castShadow = true;
  cup.receiveShadow = true;
  group.add(cup);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.065, 12, 36), ceramic);
  handle.position.set(0.46, 0.49, 0);
  handle.scale.x = 0.88;
  handle.castShadow = true;
  group.add(handle);
  const saucerProfile = [[0, 0], [0.3, 0], [0.65, 0.025], [0.71, 0.055], [0.71, 0.08], [0.66, 0.08], [0.4, 0.045], [0, 0.045]].map(([x, y]) => new THREE.Vector2(x, y));
  const saucer = new THREE.Mesh(new THREE.LatheGeometry(saucerProfile, 64), ceramic);
  saucer.castShadow = true;
  saucer.receiveShadow = true;
  group.add(saucer);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.392, 64), new THREE.MeshStandardMaterial({ color: '#25140c', roughness: 0.17, metalness: 0.1 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.813;
  group.add(coffee);
  const crema = new THREE.Mesh(new THREE.RingGeometry(0.374, 0.391, 64), new THREE.MeshStandardMaterial({ color: '#876044', roughness: 0.44 }));
  crema.rotation.x = -Math.PI / 2;
  crema.position.y = 0.814;
  group.add(crema);
  const steamOrigin = group.position.clone().add(new THREE.Vector3(0, 0.84, 0));
  return { group, steamOrigin };
}

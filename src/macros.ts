export {};

if (typeof __VERSION__ === 'undefined') {
  Reflect.set(globalThis, '__VERSION__', '0.0.0-dev');
}

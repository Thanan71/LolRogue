const runtimeMajor = Number(process.versions.node.split('.')[0]);
const timer: NodeJS.Timeout = setTimeout(() => undefined, 0);
clearTimeout(timer);

// @ts-expect-error Node scripts must not inherit browser-only DOM globals.
document.querySelector('body');
// @ts-expect-error Node scripts must not inherit the browser Window global.
window.location.href;

export { runtimeMajor };

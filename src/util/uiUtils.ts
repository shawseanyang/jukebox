// User interface related utilities

// Debounces the call to the given function by the given delay
export function debounce<F extends (...args: any[]) => any>(func: F, delay: number) {
  let timerId: NodeJS.Timeout;
  return function (this: ThisParameterType<F>, ...args: Parameters<F>) {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
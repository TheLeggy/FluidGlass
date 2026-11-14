const substep = 1 / 240;

// response and damping mean the same as they do in SwiftUI
export class Spring {
  velocity = 0;
  target: number;

  constructor(
    public value: number,
    public response: number,
    public damping: number,
  ) {
    this.target = value;
  }

  step(dt: number) {
    const omega = (2 * Math.PI) / this.response;
    let left = Math.min(dt, 0.05); // without this the first paint after a pause plays the whole press in one frame
    while (left > 1e-6) {
      const h = Math.min(left, substep);
      this.velocity += (omega * omega * (this.target - this.value) - 2 * this.damping * omega * this.velocity) * h;
      this.value += this.velocity * h;
      left -= h;
    }
  }

  get resting() {
    return Math.abs(this.target - this.value) < 1e-3 && Math.abs(this.velocity) < 1e-2;
  }
}

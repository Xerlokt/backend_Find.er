export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'AppError'
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

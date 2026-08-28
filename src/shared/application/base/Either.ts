/**
 * @file Either.ts
 * @description Functional Either implementation (Left/Right).
 */

/**
 * Functional Either type, representing a value that is either a Left
 * (typically an error/failure branch) or a Right (typically a success branch).
 *
 * @typeParam TLeft - Type held in the Left branch.
 * @typeParam TRight - Type held in the Right branch.
 */
export abstract class Either<TLeft, TRight> {
  public abstract isLeft(): this is Left<TLeft, TRight>;
  public abstract isRight(): this is Right<TLeft, TRight>;

  public abstract map<TMapped>(mapper: (value: TRight) => TMapped): Either<TLeft, TMapped>;

  public abstract flatMap<TMapped>(
    mapper: (value: TRight) => Either<TLeft, TMapped>,
  ): Either<TLeft, TMapped>;

  public abstract fold<TOutput>(
    onLeft: (value: TLeft) => TOutput,
    onRight: (value: TRight) => TOutput,
  ): TOutput;

  public abstract match<TOutput>(matchers: {
    readonly left: (value: TLeft) => TOutput;
    readonly right: (value: TRight) => TOutput;
  }): TOutput;

  public static left<TLeft, TRight = never>(value: TLeft): Either<TLeft, TRight> {
    return new Left<TLeft, TRight>(value);
  }

  public static right<TRight, TLeft = never>(value: TRight): Either<TLeft, TRight> {
    return new Right<TLeft, TRight>(value);
  }
}

/**
 * Left branch of an {@link Either}, typically representing failure.
 */
export class Left<TLeft, TRight> extends Either<TLeft, TRight> {
  private readonly value: TLeft;

  public constructor(value: TLeft) {
    super();
    this.value = value;
  }

  public isLeft(): this is Left<TLeft, TRight> {
    return true;
  }

  public isRight(): this is Right<TLeft, TRight> {
    return false;
  }

  public getValue(): TLeft {
    return this.value;
  }

  public map<TMapped>(_mapper: (value: TRight) => TMapped): Either<TLeft, TMapped> {
    return new Left<TLeft, TMapped>(this.value);
  }

  public flatMap<TMapped>(
    _mapper: (value: TRight) => Either<TLeft, TMapped>,
  ): Either<TLeft, TMapped> {
    return new Left<TLeft, TMapped>(this.value);
  }

  public fold<TOutput>(
    onLeft: (value: TLeft) => TOutput,
    _onRight: (value: TRight) => TOutput,
  ): TOutput {
    return onLeft(this.value);
  }

  public match<TOutput>(matchers: {
    readonly left: (value: TLeft) => TOutput;
    readonly right: (value: TRight) => TOutput;
  }): TOutput {
    return matchers.left(this.value);
  }
}

/**
 * Right branch of an {@link Either}, typically representing success.
 */
export class Right<TLeft, TRight> extends Either<TLeft, TRight> {
  private readonly value: TRight;

  public constructor(value: TRight) {
    super();
    this.value = value;
  }

  public isLeft(): this is Left<TLeft, TRight> {
    return false;
  }

  public isRight(): this is Right<TLeft, TRight> {
    return true;
  }

  public getValue(): TRight {
    return this.value;
  }

  public map<TMapped>(mapper: (value: TRight) => TMapped): Either<TLeft, TMapped> {
    return new Right<TLeft, TMapped>(mapper(this.value));
  }

  public flatMap<TMapped>(
    mapper: (value: TRight) => Either<TLeft, TMapped>,
  ): Either<TLeft, TMapped> {
    return mapper(this.value);
  }

  public fold<TOutput>(
    _onLeft: (value: TLeft) => TOutput,
    onRight: (value: TRight) => TOutput,
  ): TOutput {
    return onRight(this.value);
  }

  public match<TOutput>(matchers: {
    readonly left: (value: TLeft) => TOutput;
    readonly right: (value: TRight) => TOutput;
  }): TOutput {
    return matchers.right(this.value);
  }
}

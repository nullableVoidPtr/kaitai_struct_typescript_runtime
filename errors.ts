import KaitaiStream from './stream.ts';

export class EOFError extends Error {
	bytesReq: number;
	bytesAvail: number;

	constructor(bytesReq: number, bytesAvail: number) {
		super(`requested ${bytesReq} bytes, but only ${bytesAvail} bytes available`);
		this.bytesReq = bytesReq;
		this.bytesAvail = bytesAvail;

		Object.setPrototypeOf(this, EOFError.prototype);
	}
}

class KaitaiError extends Error {
	srcPath: string;

	constructor(msg: string, srcPath: string) {
		super(`${srcPath}: ${msg}`);
		this.srcPath = srcPath;

		Object.setPrototypeOf(this, KaitaiError.prototype);
	}
}

export class UndecidedEndiannessError extends KaitaiError {
	constructor(srcPath: string) {
		super("unable to decide on endianness for a type", srcPath);

		Object.setPrototypeOf(this, UndecidedEndiannessError.prototype);
	}
}

class ValidationError extends KaitaiError {
	io: KaitaiStream;

	constructor(msg: string, io: KaitaiStream, srcPath: string) {
		super(`at pos ${io.pos}: validation failed: ${msg}`, srcPath);
		this.io = io;

		Object.setPrototypeOf(this, ValidationError.prototype);
	}
}

export class ValidationNotEqualError extends ValidationError {
	expected: any;
	actual: any;

	constructor(expected: any, actual: any, io: KaitaiStream, srcPath: string) {
		super(`not equal, expected [${expected}], but got [${actual}]`, io, srcPath);
		this.expected = expected;
		this.actual = actual;

		Object.setPrototypeOf(this, ValidationNotEqualError.prototype);
	}
}

export class ValidationLessThanError extends ValidationError {
	min: any;
	actual: any;

	constructor(min: any, actual: any, io: KaitaiStream, srcPath: string) {
		super(`not in range, min [${min}], but got [${actual}]`, io, srcPath);
		this.min = min;
		this.actual = actual;

		Object.setPrototypeOf(this, ValidationLessThanError.prototype);
	}
}

export class ValidationGreaterThanError extends ValidationError {
	max: any;
	actual: any;

	constructor(max: any, actual: any, io: KaitaiStream, srcPath: string) {
		super(`not in range, max [${max}], but got [${actual}]`, io, srcPath);
		this.max = max;
		this.actual = actual;

		Object.setPrototypeOf(this, ValidationGreaterThanError.prototype);
	}
}

export class ValidationNotAnyOfError extends ValidationError {
	actual: any;

	constructor(actual: any, io: KaitaiStream, srcPath: string) {
		super(`not any of the list, got [${actual}]`, io, srcPath);
		this.actual = actual;

		Object.setPrototypeOf(this, ValidationNotAnyOfError.prototype);
	}
}

export class ValidationExprError extends ValidationError {
	actual: any;

	constructor(actual: any, io: KaitaiStream, srcPath: string) {
		super(`not matching the expression, got [${actual}]`, io, srcPath);
		this.actual = actual;

		Object.setPrototypeOf(this, ValidationExprError.prototype);
	}
}

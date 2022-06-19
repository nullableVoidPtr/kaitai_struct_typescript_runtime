'use strict';

import _Stream from './stream.ts';
import * as _Errors from './errors.ts';

type RemoveFirst<T extends unknown[]> = T extends [infer _, ...infer R] ? R : T;
type StructSubclassConstructor<T extends typeof KaitaiStruct> =
	new (...args: ConstructorParameters<typeof KaitaiStruct>) => InstanceType<T>;

export abstract class KaitaiStruct {
	public static readonly Errors = _Errors;

	protected __io: _Stream;
	protected __parent?: KaitaiStruct;
	protected __root: ThisType<KaitaiStruct>;

	constructor(_io: _Stream, _parent?: KaitaiStruct, _root?: KaitaiStruct | null) {
		this.__io = _io;
		this.__parent = _parent;
		this.__root = _root || this;
		this.__read();
	}

	protected abstract __read(): void;

	/*
	static fromArrayBuffer<T extends typeof KaitaiStruct>(
		c: StructSubclassConstructor<T>,
			arrayBuffer: ArrayBuffer, byteOffset: number = 0,
			...args: RemoveFirst<ConstructorParameters<typeof KaitaiStruct>>
	): InstanceType<T> {
		return new c(new _Stream(arrayBuffer, byteOffset), ...args);
	}
	*/
}

export default KaitaiStruct;

'use strict';

import { EOFError } from "./errors.ts";
import zlib from "node:zlib";

const MAX_AS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_AS_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export default class KaitaiStream {
	private _view!: DataView;
	
	public pos = 0;
	private bitsLeft = 0;
	private bits = 0n;

	public static readonly endianness: boolean = new Int8Array(new Int16Array([1]).buffer)[0] > 0;

	static castBigInt(n: number | bigint): number {
		if (typeof n == 'number') {
			return n;
		}

		if (n > MAX_AS_BIGINT || n < MIN_AS_BIGINT) {
			throw new RangeError("Unsupported large value passed");
		}

		return Number(n)
	}

	constructor(buffer: ArrayBufferLike | ArrayBufferView, byteOffset: number = 0, length?: number) {
		if (ArrayBuffer.isView(buffer)) {
			byteOffset += buffer.byteOffset;
			buffer = buffer.buffer;
		}

		this._view = new DataView(buffer, byteOffset, length);
	}

	get buffer(): ArrayBuffer {
		return this._view.buffer;
	}

	set buffer(v: ArrayBuffer) {
		this._view = new DataView(v, this.offset, this._view.byteLength)
	}

	get offset(): number {
		return this._view.byteOffset;
	}

	set offset(v: number) {
		this._view = new DataView(this.buffer, v, this.length)
	}

	get length(): number {
		return this._view.byteLength;
	}

	set length(v: number) {
		this._view = new DataView(this.buffer, this.offset, v)
	}

	get is_eof(): boolean {
		return this.pos >= this.size && this.bitsLeft === 0;
	}

	seek(pos: number | bigint) {
		pos = KaitaiStream.castBigInt(pos);
		const npos = Math.max(0, Math.min(this.size, pos));
		this.pos = (isNaN(npos) || !isFinite(npos)) ? 0 : npos;
	}

	get size(): number {
		return this.length - this.offset;
	}

	readInt(nBytes: 1 | 2 | 4, isLe?: boolean): number;
	readInt(nBytes: 8, isLe?: boolean): bigint;
	readInt(nBytes: 1 | 2 | 4 | 8, isLe: boolean = false): number | bigint {
		this.ensureBytesLeft(nBytes);
		let v: number | bigint;
		switch(nBytes) {
			case 1:
				v = this._view.getInt8(this.pos);
				break;
			case 2:
				v = this._view.getInt16(this.pos, isLe);
				break;
			case 4:
				v = this._view.getInt32(this.pos, isLe);
				break;
			case 8:
				v = this._view.getBigInt64(this.pos, isLe);
				break;
		}

		this.pos += nBytes;
		return v;
	}
	
	readUint(nBytes: 1 | 2 | 4, isLe?: boolean): number;
	readUint(nBytes: 8, isLe?: boolean): bigint;
	readUint(nBytes: 1 | 2 | 4 | 8, isLe: boolean = false): number | bigint {
		this.ensureBytesLeft(nBytes);
		let v: number | bigint;
		switch(nBytes) {
			case 1:
				v = this._view.getUint8(this.pos);
				break;
			case 2:
				v = this._view.getUint16(this.pos, isLe);
				break;
			case 4:
				v = this._view.getUint32(this.pos, isLe);
				break;
			case 8:
				v = this._view.getBigUint64(this.pos, isLe);
				break;
		}

		this.pos += nBytes;
		return v;
	}
	
	readFloat(nBytes: 4 | 8, isLe = false): number {
		this.ensureBytesLeft(nBytes);
		let v: number;
		switch(nBytes) {
			case 4:
				v = this._view.getFloat32(this.pos, isLe);
				break;
			case 8: 
				v = this._view.getFloat64(this.pos, isLe);
				break;
		}
		this.pos += nBytes;
		return v
	}

	alignToByte() {
		this.bitsLeft = 0;
		this.bits = 0n;
	}

	readBitsIntBe(n: number | bigint): number {
		n = KaitaiStream.castBigInt(n);
		if (n > 53) {
			throw new RangeError(`readBitsIntBe: the maximum supported bit length is 53 (tried to read ${n} bits)`);
		}

		let res = 0n;
		const bitsNeeded = n - this.bitsLeft;
		this.bitsLeft = -bitsNeeded & 7; // `-bitsNeeded mod 8`

		if (bitsNeeded > 0) {
			// 1 bit  => 1 byte
			// 8 bits => 1 byte
			// 9 bits => 2 bytes
			const bytesNeeded = ((bitsNeeded - 1) >> 3) + 1; // `ceil(bitsNeeded / 8)` (NB: `x >> 3` is `floor(x / 8)`)
			const buf = this.readBytes(bytesNeeded);
			for (const b of buf) {
				res = (res << 8n) | BigInt(b);
			}

			const newBits = res >> -BigInt(bitsNeeded);
			res = BigInt(this.bits << BigInt(bitsNeeded)) | (res >> BigInt(this.bitsLeft));
			this.bits = newBits; // will be masked at the end of the function
		} else {
			res = BigInt(this.bits);
		}

		const mask = (1n << BigInt(this.bitsLeft)) - 1n;
		this.bits &= mask;

		return Number(res);
	}

	readBitsIntLe(n: number | bigint): number { // TODO, return bigint?
		n = KaitaiStream.castBigInt(n);
		if (n > 53) {
			throw new RangeError(`readBitsIntLe: the maximum supported bit length is 53 (tried to read ${n} bits)`);
		}

		let res = 0n;
		const bitsNeeded = n - this.bitsLeft;
		const newBitsLeft = -bitsNeeded & 7;

		if (bitsNeeded > 0) {
			// 1 bit  => 1 byte
			// 8 bits => 1 byte
			// 9 bits => 2 bytes
			const bytesNeeded = ((bitsNeeded - 1) >> 3) + 1; // `ceil(bitsNeeded / 8)` (NB: `x >> 3` is `floor(x / 8)`)
			const buf = this.readBytes(bytesNeeded);
			for (let i = 0; i < bytesNeeded; i++) {
				res |= BigInt(buf[i] << (i * 8));
			}

			const newBits = (res >> BigInt(bitsNeeded)) & (BigInt(1 << newBitsLeft) - 1n);
			res = (res << BigInt(this.bitsLeft)) | BigInt(this.bits);
			this.bits = newBits;
		} else {
			res = BigInt(this.bits);
			this.bits >>= BigInt(n);
		}

		this.bitsLeft = -bitsNeeded & 7; // `-bitsNeeded mod 8`

		return Number(res);
	}

	readBytes(len: number | bigint): Uint8Array {
		len = KaitaiStream.castBigInt(len);
		return this.mapUint8Array(len);
	}

	readBytesFull(): Uint8Array {
		return this.mapUint8Array(this.size - this.pos);
	}

	readBytesTerm(terminator: number, include: boolean, consume: boolean, eosError: boolean): Uint8Array {
		const u8 = new Uint8Array(this._view.buffer, this.offset + this.pos, this.length - this.pos);
		const i = u8.findIndex(b => b === terminator);
		if (i === -1) {
			// we've read all the buffer and haven't found the terminator
			if (eosError) {
				throw new RangeError(`End of stream reached, but no terminator ${terminator} found`);
			} else {
				return u8;
			}
		} else {
			const arr = u8.subarray(0, include ? i + 1 : i);
			this.pos += i;
			if (consume) {
				this.pos += 1;
			}
			return arr;
		}
	}

	substream(len: number | bigint): KaitaiStream {
		len = KaitaiStream.castBigInt(len);
		const stream = new KaitaiStream(this._view, this.offset, len);
		this.pos += len;
		return stream;
	}

	static bytesStripRight(data: Uint8Array, padByte: number): Uint8Array {
		let newLen = data.length;
		while (data[newLen - 1] === padByte) {
			newLen--;
		}
		return data.slice(0, newLen);
	}

	static bytesTerminate(data: Uint8Array, term: number, include: boolean): Uint8Array {
		let newLen = 0;
		const maxLen = data.length;
		while (newLen < maxLen && data[newLen] !== term) {
			newLen++;
		}
		if (include && newLen < maxLen)
			newLen++;
		return data.slice(0, newLen);
	}

	static bytesToStr(arr: Uint8Array, encoding: string): string {
		if (encoding == null || encoding.toLowerCase() === "ascii") {
			return KaitaiStream.createStringFromArray(arr);
		} else {
			return (new TextDecoder(encoding)).decode(arr);
		}
	}

	static processXorOne(data: Uint8Array, key: number): Uint8Array {
		const r = new Uint8Array(data.length);
		const dl = data.length;
		for (let i = 0; i < dl; i++)
		r[i] = data[i] ^ key;
		return r;
	}

	static processXorMany(data: Uint8Array, key: Uint8Array): Uint8Array {
		const dl = data.length;
		const r = new Uint8Array(dl);
		const kl = key.length;
		let ki = 0;
		for (let i = 0; i < dl; i++) {
			r[i] = data[i] ^ key[ki];
			ki++;
			if (ki >= kl)
				ki = 0;
		}
		return r;
	}

	static processRotateLeft(data: Uint8Array, amount: number, groupSize: number): Uint8Array {
		if (groupSize !== 1)
			throw("Unable to rotate group of " + groupSize + " bytes yet");

		const mask = groupSize * 8 - 1;
		const antiAmount = -amount & mask;

		const r = new Uint8Array(data.length);
		for (let i = 0; i < data.length; i++)
		r[i] = (data[i] << amount) & 0xff | (data[i] >> antiAmount);

		return r;
	}

	static processZlib(buf: Uint8Array): Uint8Array {
		return zlib.inflateSync(buf);
	}

	static mod(a: number, b: number): number {
		if (b <= 0)
			throw new RangeError(`mod divisor <= 0 (was ${b})`);
		let r = a % b;
		if (r < 0)
			r += b;
		return r;
	}

	static arrayMin(arr: number[]): number {
		let min = arr[0];
		let x;
		for (let i = 1, n = arr.length; i < n; ++i) {
			x = arr[i];
			if (x < min) min = x;
		}
		return min;
	}

	static arrayMax(arr: number[]): number {
		let max = arr[0];
		let x;
		for (let i = 1, n = arr.length; i < n; ++i) {
			x = arr[i];
			if (x > max) max = x;
		}
		return max;
	}

	static byteArrayCompare(a: Uint8Array | number[], b: Uint8Array | number[]): number {
		if (a === b)
			return 0;
		const al = a.length;
		const bl = b.length;
		const minLen = al < bl ? al : bl;
		for (let i = 0; i < minLen; i++) {
			const cmp = a[i] - b[i];
			if (cmp !== 0)
				return cmp;
		}

		if (al === bl) {
			return 0;
		} else {
			return al - bl;
		}
	}

	ensureBytesLeft(length: number) {
		if (this.pos + length > this.size) {
			throw new EOFError(length, this.size - this.pos);
		}
	};

	mapUint8Array(length: number): Uint8Array {
		this.ensureBytesLeft(length);

		const arr = new Uint8Array(this._view.buffer, this.offset + this.pos, length);
		this.pos += length;
		return arr;
	}

	static createStringFromArray(array: Uint8Array | number[]): string {
		const chunk_size = 0x8000;
		const chunks: string[] = [];
		for (let i = 0; i < array.length; i += chunk_size) {
			chunks.push(String.fromCharCode(...array.slice(i, i + chunk_size)));
		}
		return chunks.join("");
	}
}

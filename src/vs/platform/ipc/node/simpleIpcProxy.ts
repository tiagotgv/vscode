/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';

//
// Use both `SimpleServiceProxyChannel` and `createSimpleChannelProxy`
// for a very basic process <=> process communication over methods.
//

export interface ISimpleServiceProxyChannelTarget {
	[key: string]: unknown;
}

export class SimpleServiceProxyChannelTarget implements ISimpleServiceProxyChannelTarget {
	[key: string]: unknown;
}

export interface ISimpleServiceProxyChannelTargetWithContext<T> extends ISimpleServiceProxyChannelTarget {
	context: T | undefined;
}

export class SimpleServiceProxyChannelTargetWithContext<T> extends SimpleServiceProxyChannelTarget implements ISimpleServiceProxyChannelTargetWithContext<T> {
	context: T | undefined;
}

interface ISimpleChannelProxyContext {
	__$simpleIPCContextMarker: boolean;
	context: unknown;
}

function serializeContext(context?: unknown): ISimpleChannelProxyContext | undefined {
	if (context) {
		return { __$simpleIPCContextMarker: true, context };
	}

	return undefined;
}

function deserializeContext(candidate?: ISimpleChannelProxyContext | undefined): unknown | undefined {
	if (candidate && candidate.__$simpleIPCContextMarker === true) {
		return candidate.context;
	}

	return undefined;
}

export class SimpleServiceProxyChannel<T> implements IServerChannel {

	private service: ISimpleServiceProxyChannelTarget | ISimpleServiceProxyChannelTargetWithContext<T>;

	constructor(service: ISimpleServiceProxyChannelTarget | ISimpleServiceProxyChannelTargetWithContext<T>) {
		this.service = service;
	}

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Events are currently unsupported by SimpleServiceProxyChannel: ${event}`);
	}

	call(_: unknown, command: string, args: any[]): Promise<any> {
		const target = this.service[command];
		if (typeof target === 'function') {
			const context = deserializeContext(args[0]);
			if (context) {
				this.service.context = context; // apply context to service
				args.shift(); // unshift context from args
			}

			try {
				return target.apply(this.service, args);
			} finally {
				this.service.context = undefined; // make sure to unset the context
			}
		}

		throw new Error(`Method not found: ${command}`);
	}
}

export function createSimpleChannelProxy<T>(channel: IChannel, context?: unknown): T {
	const serializedContext = serializeContext(context);

	return new Proxy({}, {
		get(_target, propKey, _receiver) {
			if (typeof propKey === 'string') {
				return function (...args: any[]) {
					let methodArgs: any[];
					if (serializedContext) {
						methodArgs = [context, ...args];
					} else {
						methodArgs = args;
					}

					return channel.call(propKey, methodArgs);
				};
			}

			throw new Error(`Unable to provide main channel proxy implementation for: ${String(propKey)}`);
		}
	}) as T;
}

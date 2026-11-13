import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AppController } from '../app.controller';
import { AuthController } from './auth.controller';
import { UsersController } from '../users/users.controller';
import { parse } from 'yaml';

const methodNames: Record<number, string> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.OPTIONS]: 'options',
  [RequestMethod.HEAD]: 'head',
  [RequestMethod.ALL]: 'all',
};

function routePath(controllerPath: string, methodPath: string): string {
  const joined = `/${controllerPath}/${methodPath}`
    .replace(/\/+/g, '/')
    .replace(/:(\w+)/g, '{$1}');
  return joined === '/' ? '/' : joined.replace(/\/$/, '');
}

describe('OpenAPI route coverage', () => {
  it('only specifies operations with a decorated NestJS route', () => {
    const specification = parse(
      readFileSync(resolve(__dirname, '../../openapi/v1.yaml'), 'utf8'),
    ) as {
      servers: Array<{ url: string }>;
      paths: Record<
        string,
        Record<string, { servers?: Array<{ url: string }> } | unknown>
      >;
    };
    const implemented = new Set<string>();

    for (const controller of [
      AuthController,
      UsersController,
      AppController,
    ]) {
      const prefixes = Reflect.getMetadata(PATH_METADATA, controller) as
        | string
        | string[];
      const methods = Object.getOwnPropertyNames(controller.prototype).filter(
        (name) => name !== 'constructor',
      );
      const prototype = controller.prototype as unknown as Record<
        string,
        unknown
      >;
      for (const methodName of methods) {
        const handler = prototype[methodName] as object;
        const requestMethod = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        ) as RequestMethod | undefined;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          | string
          | string[]
          | undefined;
        if (requestMethod === undefined) {
          continue;
        }
        const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
        const pathList = Array.isArray(path) ? path : [path ?? ''];
        for (const prefix of prefixList) {
          for (const item of pathList) {
            implemented.add(
              `${methodNames[requestMethod]} ${routePath(prefix, item)}`,
            );
          }
        }
      }
    }

    const missing: string[] = [];
    for (const [path, operations] of Object.entries(specification.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (['parameters', 'servers', 'summary', 'description'].includes(method)) {
          continue;
        }
        const operationServers = (
          operation as { servers?: Array<{ url: string }> }
        ).servers;
        const basePath =
          operationServers?.[0]?.url ?? specification.servers[0].url;
        const fullPath = routePath(basePath, path);
        if (!implemented.has(`${method.toLowerCase()} ${fullPath}`)) {
          missing.push(`${method.toUpperCase()} ${fullPath}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

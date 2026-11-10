import { z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  jsonObjectSchema,
  librarySchema,
  moduleJsonSchema,
  newModuleSchema,
  newPageSchema,
  newProductSchema,
  pageSummarySchema,
  productJsonSchema,
  UPLOAD_KINDS,
  uploadResultSchema,
} from '../../../../admin/shared/api-types';
import { AppError } from '../../domain/errors';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { moduleParams, productParam, requestContext } from './util';

const uploadForm = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary', description: 'The picture or video' }),
  kind: z.enum(UPLOAD_KINDS).openapi({ description: 'image → module images/ folder; video → module media/ folder' }),
});

export function registerLibrary(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/library',
      tags: ['Library'],
      summary: 'Every product → module → page, with badges (text, screenshots, video)',
      responses: { 200: okResponse(librarySchema, 'The library') },
    }),
    async (c) => c.json(ok(await c.get('services').content.getLibrary()), 200),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/products',
      tags: ['Library'],
      summary: 'Add a product (starts private and coming soon)',
      request: { body: { required: true, content: { 'application/json': { schema: newProductSchema } } } },
      responses: { 201: okResponse(productJsonSchema, 'Created product.json'), ...errorResponses(400, 409, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').content.createProduct(requestContext(c), c.req.valid('json')), 'Product added.'), 201),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'put',
      path: '/api/v1/products/{product}',
      tags: ['Library'],
      summary: 'Save product.json (fields the form does not show are kept)',
      request: { params: productParam, body: { required: true, content: { 'application/json': { schema: jsonObjectSchema } } } },
      responses: { 200: okResponse(productJsonSchema, 'Saved product.json'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').content.saveProduct(requestContext(c), c.req.valid('param').product, c.req.valid('json')), 'Saved.'), 200),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/products/{product}/modules',
      tags: ['Library'],
      summary: 'Add a module to a product',
      request: { params: productParam, body: { required: true, content: { 'application/json': { schema: newModuleSchema } } } },
      responses: { 201: okResponse(moduleJsonSchema, 'Created module.json'), ...errorResponses(400, 404, 409, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').content.createModule(requestContext(c), c.req.valid('param').product, c.req.valid('json')), 'Module added.'), 201),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'put',
      path: '/api/v1/products/{product}/modules/{module}',
      tags: ['Library'],
      summary: 'Save module.json',
      request: { params: moduleParams, body: { required: true, content: { 'application/json': { schema: jsonObjectSchema } } } },
      responses: { 200: okResponse(moduleJsonSchema, 'Saved module.json'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(ok(await c.get('services').content.saveModule(requestContext(c), p.product, p.module, c.req.valid('json')), 'Saved.'), 200);
    },
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/products/{product}/modules/{module}/pages',
      tags: ['Pages'],
      summary: 'Add a draft page to a module',
      request: { params: moduleParams, body: { required: true, content: { 'application/json': { schema: newPageSchema } } } },
      responses: { 201: okResponse(pageSummarySchema, 'The new page'), ...errorResponses(400, 404, 409, 422) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(ok(await c.get('services').content.createPage(requestContext(c), p.product, p.module, c.req.valid('json')), 'Draft page created.'), 201);
    },
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/products/{product}/modules/{module}/uploads',
      tags: ['Uploads'],
      summary: 'Upload a picture (images/) or video (media/). Extension and content are checked; existing files are never replaced.',
      request: { params: moduleParams, body: { required: true, content: { 'multipart/form-data': { schema: uploadForm } } } },
      responses: { 201: okResponse(uploadResultSchema, 'The saved file'), ...errorResponses(400, 404, 409, 413, 415, 422) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      const form = c.req.valid('form');
      const file: unknown = form.file;
      if (!(file instanceof File)) throw new AppError('INVALID', 'Choose a file to upload.', [{ field: 'file', message: 'File is required' }]);
      const result = await c.get('services').uploads.upload(requestContext(c), p.product, p.module, form.kind, {
        name: file.name,
        size: file.size,
        bytes: async () => new Uint8Array(await file.arrayBuffer()),
      });
      return c.json(ok(result, result.renamed ? `Saved as ${result.name}.` : 'Uploaded.'), 201);
    },
  );

  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/products/{product}/images',
      tags: ['Uploads'],
      summary: 'Every picture in a product ("module/images/file"), for choosing its hero pictures',
      request: { params: productParam },
      responses: { 200: okResponse(z.array(z.string()), 'Pictures'), ...errorResponses(400, 404) },
    }),
    async (c) => c.json(ok(await c.get('services').uploads.listProductImages(c.req.valid('param').product)), 200),
  );
}

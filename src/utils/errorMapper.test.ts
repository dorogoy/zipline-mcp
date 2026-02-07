import { describe, it, expect } from 'vitest';
import {
  McpErrorCode,
  ZiplineError,
  mapHttpStatusToMcpError,
} from './errorMapper';

describe('errorMapper', () => {
  describe('McpErrorCode enum', () => {
    it('should have UNAUTHORIZED_ACCESS code', () => {
      expect(McpErrorCode.UNAUTHORIZED_ACCESS).toBe('UNAUTHORIZED_ACCESS');
    });

    it('should have FORBIDDEN_OPERATION code', () => {
      expect(McpErrorCode.FORBIDDEN_OPERATION).toBe('FORBIDDEN_OPERATION');
    });

    it('should have RESOURCE_NOT_FOUND code', () => {
      expect(McpErrorCode.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
    });

    it('should have PAYLOAD_TOO_LARGE code', () => {
      expect(McpErrorCode.PAYLOAD_TOO_LARGE).toBe('PAYLOAD_TOO_LARGE');
    });

    it('should have RATE_LIMIT_EXCEEDED code', () => {
      expect(McpErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should have INTERNAL_ZIPLINE_ERROR code', () => {
      expect(McpErrorCode.INTERNAL_ZIPLINE_ERROR).toBe(
        'INTERNAL_ZIPLINE_ERROR'
      );
    });
  });

  describe('ZiplineError class', () => {
    it('should create error with all properties', () => {
      const error = new ZiplineError(
        'Test message',
        McpErrorCode.UNAUTHORIZED_ACCESS,
        401,
        'response body',
        'Resolution guidance'
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ZiplineError');
      expect(error.message).toBe('Test message');
      expect(error.mcpCode).toBe(McpErrorCode.UNAUTHORIZED_ACCESS);
      expect(error.httpStatus).toBe(401);
      expect(error.responseBody).toBe('response body');
      expect(error.resolutionGuidance).toBe('Resolution guidance');
    });

    it('should create error without optional properties', () => {
      const error = new ZiplineError(
        'Test message',
        McpErrorCode.INTERNAL_ZIPLINE_ERROR,
        500
      );

      expect(error.message).toBe('Test message');
      expect(error.mcpCode).toBe(McpErrorCode.INTERNAL_ZIPLINE_ERROR);
      expect(error.httpStatus).toBe(500);
      expect(error.responseBody).toBeUndefined();
      expect(error.resolutionGuidance).toBeUndefined();
    });

    it('should be identifiable by instanceof', () => {
      const error = new ZiplineError(
        'Test',
        McpErrorCode.UNAUTHORIZED_ACCESS,
        401
      );

      expect(error instanceof ZiplineError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('mapHttpStatusToMcpError', () => {
    describe('Authentication errors', () => {
      it('should map 401 to UNAUTHORIZED_ACCESS', () => {
        const error = mapHttpStatusToMcpError(401);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.UNAUTHORIZED_ACCESS);
        expect(error.httpStatus).toBe(401);
        expect(error.resolutionGuidance).toContain('ZIPLINE_TOKEN');
        expect(error.resolutionGuidance).toContain('environment variable');
      });

      it('should map 403 to FORBIDDEN_OPERATION', () => {
        const error = mapHttpStatusToMcpError(403);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.FORBIDDEN_OPERATION);
        expect(error.httpStatus).toBe(403);
        expect(error.resolutionGuidance).toContain('permissions');
      });
    });

    describe('Resource errors', () => {
      it('should map 404 to RESOURCE_NOT_FOUND', () => {
        const error = mapHttpStatusToMcpError(404);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.RESOURCE_NOT_FOUND);
        expect(error.httpStatus).toBe(404);
        expect(error.resolutionGuidance).toContain('does not exist');
        expect(error.resolutionGuidance).toContain('list_user_files');
      });
    });

    describe('Payload errors', () => {
      it('should map 413 to PAYLOAD_TOO_LARGE', () => {
        const error = mapHttpStatusToMcpError(413);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.PAYLOAD_TOO_LARGE);
        expect(error.httpStatus).toBe(413);
        expect(error.resolutionGuidance).toContain('File size');
        expect(error.resolutionGuidance).toContain('exceeds server limit');
      });
    });

    describe('Rate limiting', () => {
      it('should map 429 to RATE_LIMIT_EXCEEDED', () => {
        const error = mapHttpStatusToMcpError(429);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.RATE_LIMIT_EXCEEDED);
        expect(error.httpStatus).toBe(429);
        expect(error.resolutionGuidance).toContain('Rate limit');
        expect(error.resolutionGuidance).toContain('50 req/min');
      });
    });

    describe('Server errors', () => {
      it('should map 500 to INTERNAL_ZIPLINE_ERROR', () => {
        const error = mapHttpStatusToMcpError(500);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.INTERNAL_ZIPLINE_ERROR);
        expect(error.httpStatus).toBe(500);
        expect(error.message).toContain('(HTTP 500)');
        expect(error.resolutionGuidance).toContain('Zipline server error');
      });

      it('should map 502 to INTERNAL_ZIPLINE_ERROR', () => {
        const error = mapHttpStatusToMcpError(502);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.INTERNAL_ZIPLINE_ERROR);
        expect(error.httpStatus).toBe(502);
      });

      it('should map 503 to INTERNAL_ZIPLINE_ERROR', () => {
        const error = mapHttpStatusToMcpError(503);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.INTERNAL_ZIPLINE_ERROR);
        expect(error.httpStatus).toBe(503);
      });
    });

    describe('Unknown status codes', () => {
      it("should map 418 (I'm a teapot) to INTERNAL_ZIPLINE_ERROR", () => {
        const error = mapHttpStatusToMcpError(418);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.INTERNAL_ZIPLINE_ERROR);
        expect(error.httpStatus).toBe(418);
        expect(error.resolutionGuidance).toContain('Unexpected error');
      });

      it('should map 999 to INTERNAL_ZIPLINE_ERROR', () => {
        const error = mapHttpStatusToMcpError(999);

        expect(error).toBeInstanceOf(ZiplineError);
        expect(error.mcpCode).toBe(McpErrorCode.INTERNAL_ZIPLINE_ERROR);
        expect(error.httpStatus).toBe(999);
      });
    });

    describe('Response body handling', () => {
      it('should include response body when provided', () => {
        const error = mapHttpStatusToMcpError(404, 'File not found');

        expect(error.responseBody).toBe('File not found');
      });

      it('should handle undefined response body', () => {
        const error = mapHttpStatusToMcpError(404, undefined);

        expect(error.responseBody).toBeUndefined();
      });

      it('should handle empty string response body', () => {
        const error = mapHttpStatusToMcpError(404, '');

        expect(error.responseBody).toBe('');
      });
    });

    describe('Resolution guidance', () => {
      it('should provide resolution guidance for UNAUTHORIZED_ACCESS', () => {
        const error = mapHttpStatusToMcpError(401);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('ZIPLINE_TOKEN');
        expect(error.resolutionGuidance).toContain('valid and not expired');
      });

      it('should provide resolution guidance for FORBIDDEN_OPERATION', () => {
        const error = mapHttpStatusToMcpError(403);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('permissions');
      });

      it('should provide resolution guidance for RESOURCE_NOT_FOUND', () => {
        const error = mapHttpStatusToMcpError(404);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('does not exist');
        expect(error.resolutionGuidance.toLowerCase()).toContain('verify');
      });

      it('should provide resolution guidance for PAYLOAD_TOO_LARGE', () => {
        const error = mapHttpStatusToMcpError(413);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('Reduce file size');
        expect(error.resolutionGuidance).toContain('5MB');
      });

      it('should provide resolution guidance for RATE_LIMIT_EXCEEDED', () => {
        const error = mapHttpStatusToMcpError(429);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('Wait before retrying');
        expect(error.resolutionGuidance).toContain('50 req/min');
      });

      it('should provide resolution guidance for INTERNAL_ZIPLINE_ERROR (500)', () => {
        const error = mapHttpStatusToMcpError(500);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('server logs');
        expect(error.resolutionGuidance).toContain('Retry after brief delay');
      });

      it('should provide resolution guidance for INTERNAL_ZIPLINE_ERROR (unknown)', () => {
        const error = mapHttpStatusToMcpError(418);

        expect(error.resolutionGuidance).toBeTruthy();
        expect(error.resolutionGuidance).toContain('Unexpected error');
        expect(error.resolutionGuidance).toContain('network connectivity');
      });
    });
  });
});

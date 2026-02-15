export enum McpErrorCode {
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  FORBIDDEN_OPERATION = 'FORBIDDEN_OPERATION',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ZIPLINE_ERROR = 'INTERNAL_ZIPLINE_ERROR',
}

export class ZiplineError extends Error {
  constructor(
    message: string,
    public mcpCode: McpErrorCode,
    public httpStatus: number,
    public responseBody?: string,
    public resolutionGuidance?: string
  ) {
    super(message);
    this.name = 'ZiplineError';
  }
}

function getResolutionGuidance(httpStatus: number): string {
  switch (httpStatus) {
    case 401:
      return 'Check ZIPLINE_TOKEN environment variable. Verify token is valid and not expired. Ensure token has correct permissions.';
    case 403:
      return 'Operation not permitted with current token. Verify token has required permissions for this operation. Contact administrator if access is needed.';
    case 404:
      return 'Requested resource does not exist. Verify file/folder ID is correct. Use list_user_files or remote_folder_manager LIST to find correct ID.';
    case 413:
      return 'File size exceeds server limit. Reduce file size below 5MB or check server configuration for size limits.';
    case 429:
      return 'Rate limit exceeded (max 50 req/min). Wait before retrying. Reduce request frequency or contact administrator for higher limits.';
    case 500:
    case 502:
    case 503:
      return 'Zipline server error. Check server logs. Verify server is running and accessible. Retry after brief delay.';
    default:
      return 'Unexpected error from Zipline API. Check network connectivity. Verify endpoint configuration. Review server logs.';
  }
}

export function mapHttpStatusToMcpError(
  httpStatus: number,
  responseBody?: string
): ZiplineError {
  let mcpCode: McpErrorCode;
  let message: string;

  switch (httpStatus) {
    case 401:
      mcpCode = McpErrorCode.UNAUTHORIZED_ACCESS;
      message = 'Authentication failed';
      break;
    case 403:
      mcpCode = McpErrorCode.FORBIDDEN_OPERATION;
      message = 'Operation forbidden';
      break;
    case 404:
      mcpCode = McpErrorCode.RESOURCE_NOT_FOUND;
      message = 'Resource not found';
      break;
    case 413:
      mcpCode = McpErrorCode.PAYLOAD_TOO_LARGE;
      message = 'Payload too large';
      break;
    case 429:
      mcpCode = McpErrorCode.RATE_LIMIT_EXCEEDED;
      message = 'Rate limit exceeded';
      break;
    default:
      mcpCode = McpErrorCode.INTERNAL_ZIPLINE_ERROR;
      message = `Internal Zipline error (HTTP ${httpStatus})`;
      break;
  }

  const resolutionGuidance = getResolutionGuidance(httpStatus);

  return new ZiplineError(
    message,
    mcpCode,
    httpStatus,
    responseBody,
    resolutionGuidance
  );
}

export class ApiError extends Error {
  constructor(status, code, message, fields = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function validationError(fields, message = "请求字段不符合要求") {
  return new ApiError(400, "VALIDATION_ERROR", message, fields);
}

export function notFound(message = "资源不存在") {
  return new ApiError(404, "NOT_FOUND", message);
}

export function forbidden(message = "没有权限执行该操作") {
  return new ApiError(403, "FORBIDDEN", message);
}

export function conflict(message, fields = undefined) {
  return new ApiError(409, "CONFLICT", message, fields);
}

export function invalidTransition(message) {
  return new ApiError(409, "INVALID_STATE_TRANSITION", message);
}

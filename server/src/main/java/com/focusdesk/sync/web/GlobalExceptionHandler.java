package com.focusdesk.sync.web;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<Map<String, String>> handleApi(ApiException ex) {
    return ResponseEntity.status(ex.getStatus()).body(Map.of("error", ex.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
    FieldError field = ex.getBindingResult().getFieldError();
    String message = field == null ? "参数无效" : field.getDefaultMessage();
    return ResponseEntity.badRequest().body(Map.of("error", message == null ? "参数无效" : message));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, String>> handleOther(Exception ex) {
    ex.printStackTrace();
    String message = ex.getMessage() == null ? "服务器错误" : ex.getMessage();
    return ResponseEntity.internalServerError().body(Map.of("error", message));
  }
}

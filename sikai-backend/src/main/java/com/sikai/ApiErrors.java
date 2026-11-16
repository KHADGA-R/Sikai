package com.sikai;

import java.time.Instant;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;

/** Consistent safe errors: internal SQL, credentials and stack traces never enter API responses. */
@RestControllerAdvice
public class ApiErrors {

    /** Build the shared HTTP error body with a status, safe message and timestamp. */
    private ResponseEntity<?> error(HttpStatusCode status,String message) {
        return ResponseEntity.status(status).body(Map.of("status",status.value(),"message",message,"timestamp",Instant.now().toString()));
    }

    /** Preserve deliberate service-layer HTTP statuses without exposing exception internals. */
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> status(ResponseStatusException e) { return error(e.getStatusCode(),e.getReason()==null?"Request failed":e.getReason()); }

    /** Return the first field-validation failure as a readable bad-request response. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException e) {
        return error(HttpStatus.BAD_REQUEST,e.getBindingResult().getFieldErrors().stream().map(f->f.getField()+": "+f.getDefaultMessage()).findFirst().orElse("Invalid input"));
    }

    /** Handle malformed JSON, missing request values and invalid primitive conversions uniformly. */
    @ExceptionHandler({IllegalArgumentException.class,HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class,MissingServletRequestParameterException.class,MissingServletRequestPartException.class})
    ResponseEntity<?> invalid(Exception e) { return error(HttpStatus.BAD_REQUEST,"Invalid request values or JSON"); }

    /** Return 404 when Spring cannot resolve a requested endpoint or static resource. */
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<?> missing(Exception e) { return error(HttpStatus.NOT_FOUND,"Endpoint not found"); }

    /** Return 405 for a route called with an unsupported HTTP method. */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<?> method(Exception e) { return error(HttpStatus.METHOD_NOT_ALLOWED,"HTTP method not supported"); }

    /** Return 415 when a request uses an unsupported content type. */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<?> media(Exception e) { return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"Content type not supported"); }

    /** Translate relational uniqueness or dependency violations into a safe conflict response. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(Exception e) { return error(HttpStatus.CONFLICT,"Record already exists or has dependent records"); }

    /** Explain the multipart upload limit without returning servlet implementation details. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<?> large(Exception e) { return error(HttpStatus.PAYLOAD_TOO_LARGE,"Maximum upload size is 100 MB"); }

    /** Log unexpected failures on the server while returning a generic 500 response to clients. */
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception e) {
        LoggerFactory.getLogger(ApiErrors.class).error("Unhandled request failure",e);
        return error(HttpStatus.INTERNAL_SERVER_ERROR,"Unexpected server error");
    }
}

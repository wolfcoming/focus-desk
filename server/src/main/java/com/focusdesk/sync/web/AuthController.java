package com.focusdesk.sync.web;

import com.focusdesk.sync.security.UserPrincipal;
import com.focusdesk.sync.service.AuthService;
import com.focusdesk.sync.web.dto.AuthDtos.AuthResponse;
import com.focusdesk.sync.web.dto.AuthDtos.LoginRequest;
import com.focusdesk.sync.web.dto.AuthDtos.ProfileResponse;
import com.focusdesk.sync.web.dto.AuthDtos.RegisterRequest;
import com.focusdesk.sync.web.dto.AuthDtos.UpdateProfileRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/register")
  AuthResponse register(@Valid @RequestBody RegisterRequest request) {
    return authService.register(request);
  }

  @PostMapping("/login")
  AuthResponse login(@Valid @RequestBody LoginRequest request) {
    return authService.login(request);
  }

  @GetMapping("/me")
  ProfileResponse me(@AuthenticationPrincipal UserPrincipal user) {
    requireUser(user);
    return authService.me(user);
  }

  @PatchMapping("/me")
  ProfileResponse updateProfile(
      @AuthenticationPrincipal UserPrincipal user,
      @Valid @RequestBody UpdateProfileRequest request
  ) {
    requireUser(user);
    return authService.updateProfile(user, request);
  }

  private static void requireUser(UserPrincipal user) {
    if (user == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "请先登录");
    }
  }
}

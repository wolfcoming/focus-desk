package com.focusdesk.sync.service;

import com.focusdesk.sync.domain.UserAccount;
import com.focusdesk.sync.repo.UserAccountRepository;
import com.focusdesk.sync.security.JwtService;
import com.focusdesk.sync.web.ApiException;
import com.focusdesk.sync.web.dto.AuthDtos.AuthResponse;
import com.focusdesk.sync.web.dto.AuthDtos.LoginRequest;
import com.focusdesk.sync.web.dto.AuthDtos.RegisterRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final UserAccountRepository users;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  public AuthService(UserAccountRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
    this.users = users;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
  }

  @Transactional
  public AuthResponse register(RegisterRequest request) {
    String email = request.email().trim().toLowerCase();
    if (users.existsByEmailIgnoreCase(email)) {
      throw new ApiException(HttpStatus.CONFLICT, "邮箱已注册");
    }
    UserAccount user = new UserAccount();
    user.setEmail(email);
    user.setPasswordHash(passwordEncoder.encode(request.password()));
    users.save(user);
    String token = jwtService.issue(user.getId(), user.getEmail(), user.getRole());
    return new AuthResponse(token, user.getId(), user.getEmail());
  }

  @Transactional(readOnly = true)
  public AuthResponse login(LoginRequest request) {
    String email = request.email().trim().toLowerCase();
    UserAccount user = users.findByEmailIgnoreCase(email)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "邮箱或密码不正确"));
    if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "邮箱或密码不正确");
    }
    String token = jwtService.issue(user.getId(), user.getEmail(), user.getRole());
    return new AuthResponse(token, user.getId(), user.getEmail());
  }
}

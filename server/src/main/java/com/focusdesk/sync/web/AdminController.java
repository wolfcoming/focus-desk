package com.focusdesk.sync.web;

import com.focusdesk.sync.security.UserPrincipal;
import com.focusdesk.sync.service.AdminService;
import com.focusdesk.sync.web.dto.AdminDtos.OverviewView;
import com.focusdesk.sync.web.dto.AdminDtos.PageView;
import com.focusdesk.sync.web.dto.AdminDtos.PasswordRequest;
import com.focusdesk.sync.web.dto.AdminDtos.RecordView;
import com.focusdesk.sync.web.dto.AdminDtos.UserView;
import com.focusdesk.sync.web.dto.AuthDtos.AuthResponse;
import com.focusdesk.sync.web.dto.AuthDtos.LoginRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {
  private final AdminService adminService;

  public AdminController(AdminService adminService) {
    this.adminService = adminService;
  }

  @PostMapping("/login")
  AuthResponse login(@Valid @RequestBody LoginRequest request) {
    return adminService.login(request);
  }

  @GetMapping("/overview")
  OverviewView overview() {
    return adminService.overview();
  }

  @GetMapping("/users")
  List<UserView> users(@RequestParam(required = false) String q) {
    return adminService.users(q);
  }

  @DeleteMapping("/users/{id}")
  Map<String, String> deleteUser(@PathVariable Long id) {
    adminService.deleteUser(id, current().getId());
    return Map.of("status", "ok");
  }

  @PostMapping("/users/{id}/password")
  Map<String, String> resetPassword(@PathVariable Long id, @RequestBody PasswordRequest request) {
    adminService.resetPassword(id, request.password());
    return Map.of("status", "ok");
  }

  @GetMapping("/records")
  PageView<RecordView> records(
      @RequestParam(required = false) Long userId,
      @RequestParam(required = false) String collection,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size
  ) {
    return adminService.records(userId, collection, q, page, size);
  }

  @DeleteMapping("/records/{id}")
  Map<String, String> deleteRecord(@PathVariable Long id) {
    adminService.deleteRecord(id);
    return Map.of("status", "ok");
  }

  private UserPrincipal current() {
    return (UserPrincipal) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
  }
}

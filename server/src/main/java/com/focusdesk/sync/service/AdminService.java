package com.focusdesk.sync.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.focusdesk.sync.domain.SyncRecord;
import com.focusdesk.sync.domain.UserAccount;
import com.focusdesk.sync.repo.SyncRecordRepository;
import com.focusdesk.sync.repo.UserAccountRepository;
import com.focusdesk.sync.security.JwtService;
import com.focusdesk.sync.web.ApiException;
import com.focusdesk.sync.web.dto.AdminDtos.BucketView;
import com.focusdesk.sync.web.dto.AdminDtos.OverviewView;
import com.focusdesk.sync.web.dto.AdminDtos.PageView;
import com.focusdesk.sync.web.dto.AdminDtos.RecordView;
import com.focusdesk.sync.web.dto.AdminDtos.UserView;
import com.focusdesk.sync.web.dto.AuthDtos.AuthResponse;
import com.focusdesk.sync.web.dto.AuthDtos.LoginRequest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminService {
  private final UserAccountRepository users;
  private final SyncRecordRepository records;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;
  private final ObjectMapper objectMapper;

  public AdminService(
      UserAccountRepository users,
      SyncRecordRepository records,
      PasswordEncoder passwordEncoder,
      JwtService jwtService,
      ObjectMapper objectMapper
  ) {
    this.users = users;
    this.records = records;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public AuthResponse login(LoginRequest request) {
    String email = request.email().trim().toLowerCase();
    UserAccount user = users.findByEmailIgnoreCase(email)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "邮箱或密码不正确"));
    if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "邮箱或密码不正确");
    }
    if (!"ADMIN".equals(user.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "这个账号没有管理权限");
    }
    String token = jwtService.issue(user.getId(), user.getEmail(), user.getRole());
    return new AuthResponse(token, user.getId(), user.getEmail());
  }

  @Transactional(readOnly = true)
  public OverviewView overview() {
    Map<Long, String> emails = new HashMap<>();
    users.findAll().forEach(user -> emails.put(user.getId(), user.getEmail()));
    List<BucketView> buckets = records.countByCollection().stream()
        .map(row -> new BucketView(String.valueOf(row[0]), ((Number) row[1]).longValue()))
        .toList();
    List<RecordView> recent = records.search(null, "", "", PageRequest.of(0, 8, Sort.by(Sort.Direction.DESC, "updatedAt")))
        .map(record -> toRecord(record, emails.get(record.getUserId())))
        .getContent();
    return new OverviewView(users.count(), records.count(), records.countByDeletedAtIsNotNull(), buckets, recent);
  }

  @Transactional(readOnly = true)
  public List<UserView> users(String query) {
    String q = query == null ? "" : query.trim().toLowerCase();
    Map<Long, Long> counts = new HashMap<>();
    for (Object[] row : records.countByUser()) {
      counts.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
    }
    return users.findAll().stream()
        .filter(user -> q.isEmpty() || user.getEmail().toLowerCase().contains(q))
        .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
        .map(user -> new UserView(
            user.getId(),
            user.getEmail(),
            user.getRole(),
            user.getCreatedAt(),
            user.getUpdatedAt(),
            counts.getOrDefault(user.getId(), 0L)
        ))
        .toList();
  }

  @Transactional
  public void deleteUser(Long id, Long actorId) {
    UserAccount user = users.findById(id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "用户不存在"));
    if (user.getId().equals(actorId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "不能删除当前登录的管理员");
    }
    if ("ADMIN".equals(user.getRole()) && users.findAll().stream().filter(item -> "ADMIN".equals(item.getRole())).count() <= 1) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "至少保留一个管理员");
    }
    records.deleteByUserId(id);
    users.delete(user);
  }

  @Transactional
  public void resetPassword(Long id, String password) {
    if (password == null || password.length() < 8 || password.length() > 72) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "密码长度需 8~72 位");
    }
    UserAccount user = users.findById(id)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "用户不存在"));
    user.setPasswordHash(passwordEncoder.encode(password));
    users.save(user);
  }

  @Transactional(readOnly = true)
  public PageView<RecordView> records(Long userId, String collection, String query, int page, int size) {
    int safePage = Math.max(page, 0);
    int safeSize = Math.min(Math.max(size, 1), 100);
    Map<Long, String> emails = new HashMap<>();
    users.findAll().forEach(user -> emails.put(user.getId(), user.getEmail()));
    var result = records.search(
        userId,
        collection == null ? "" : collection.trim(),
        query == null ? "" : query.trim(),
        PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "updatedAt"))
    );
    List<RecordView> items = result.getContent().stream()
        .map(record -> toRecord(record, emails.get(record.getUserId())))
        .toList();
    return new PageView<>(items, result.getTotalElements(), safePage, safeSize);
  }

  @Transactional
  public void deleteRecord(Long id) {
    if (!records.existsById(id)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "记录不存在");
    }
    records.deleteById(id);
  }

  private RecordView toRecord(SyncRecord record, String email) {
    boolean deleted = record.getDeletedAt() != null;
    JsonNode payload = objectMapper.createObjectNode();
    if (!deleted && record.getPayload() != null && !record.getPayload().isBlank()) {
      try {
        payload = objectMapper.readTree(record.getPayload());
      } catch (Exception ignored) {
        payload = objectMapper.createObjectNode().put("raw", record.getPayload());
      }
    }
    return new RecordView(
        record.getId(),
        record.getUserId(),
        email == null ? "" : email,
        record.getCollection(),
        record.getClientId(),
        record.getUpdatedAt(),
        deleted,
        payload
    );
  }
}

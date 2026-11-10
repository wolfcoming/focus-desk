package com.focusdesk.sync.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

public final class AdminDtos {
  private AdminDtos() {}

  public record BucketView(String collection, long count) {}

  public record UserView(
      Long id,
      String email,
      String role,
      Instant createdAt,
      Instant updatedAt,
      long records
  ) {}

  public record RecordView(
      Long id,
      Long userId,
      String email,
      String collection,
      String clientId,
      Instant updatedAt,
      boolean deleted,
      JsonNode payload
  ) {}

  public record OverviewView(
      long users,
      long records,
      long deleted,
      List<BucketView> collections,
      List<RecordView> recent
  ) {}

  public record PageView<T>(List<T> items, long total, int page, int size) {}

  public record PasswordRequest(String password) {}
}

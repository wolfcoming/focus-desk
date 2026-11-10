package com.focusdesk.sync.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public final class SyncDtos {
  private SyncDtos() {}

  public record SyncChange(
      @NotBlank String collection,
      @NotBlank String clientId,
      @NotNull Instant updatedAt,
      boolean deleted,
      JsonNode payload
  ) {}

  public record SyncPushRequest(@NotNull @Valid List<SyncChange> changes) {}

  public record SyncPushResult(String collection, String clientId, Instant updatedAt, String status) {}

  public record SyncPushResponse(List<SyncPushResult> results, Instant serverTime) {}

  public record SyncPullResponse(List<SyncChange> changes, Instant serverTime) {}
}

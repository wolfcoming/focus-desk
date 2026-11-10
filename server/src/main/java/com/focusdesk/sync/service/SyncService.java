package com.focusdesk.sync.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.focusdesk.sync.domain.SyncRecord;
import com.focusdesk.sync.repo.SyncRecordRepository;
import com.focusdesk.sync.web.ApiException;
import com.focusdesk.sync.web.dto.SyncDtos.SyncChange;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPullResponse;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPushRequest;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPushResponse;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPushResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SyncService {
  private static final Set<String> ALLOWED = Set.of(
      "projects",
      "subprojects",
      "items",
      "today_slots",
      "today_completions",
      "daily_marks",
      "work_logs",
      "idea_tags"
  );

  private final SyncRecordRepository records;
  private final ObjectMapper objectMapper;

  public SyncService(SyncRecordRepository records, ObjectMapper objectMapper) {
    this.records = records;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public SyncPushResponse push(Long userId, SyncPushRequest request) {
    List<SyncPushResult> results = new ArrayList<>();
    for (SyncChange change : request.changes()) {
      String collection = normalizeCollection(change.collection());
      String clientId = change.clientId().trim();
      if (clientId.isEmpty() || clientId.length() > 64) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "clientId 无效");
      }

      SyncRecord record = records
          .findByUserIdAndCollectionAndClientId(userId, collection, clientId)
          .orElseGet(SyncRecord::new);

      if (record.getId() != null
          && record.getUpdatedAt() != null
          && change.updatedAt() != null
          && record.getUpdatedAt().isAfter(change.updatedAt())) {
        results.add(new SyncPushResult(collection, clientId, record.getUpdatedAt(), "rejected_stale"));
        continue;
      }

      record.setUserId(userId);
      record.setCollection(collection);
      record.setClientId(clientId);
      record.setUpdatedAt(change.updatedAt() == null ? Instant.now() : change.updatedAt());
      if (change.deleted()) {
        record.setDeletedAt(Instant.now());
        record.setPayload("{}");
      } else {
        record.setDeletedAt(null);
        record.setPayload(writePayload(change.payload()));
      }
      records.save(record);
      results.add(new SyncPushResult(collection, clientId, record.getUpdatedAt(), "accepted"));
    }
    return new SyncPushResponse(results, Instant.now());
  }

  @Transactional(readOnly = true)
  public SyncPullResponse pull(Long userId, Instant since) {
    Instant cursor = since == null ? Instant.EPOCH : since;
    List<SyncChange> changes = records
        .findByUserIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(userId, cursor)
        .stream()
        .map(this::toChange)
        .toList();
    return new SyncPullResponse(changes, Instant.now());
  }

  private SyncChange toChange(SyncRecord record) {
    boolean deleted = record.getDeletedAt() != null;
    JsonNode payload;
    try {
      payload = deleted ? objectMapper.createObjectNode() : objectMapper.readTree(record.getPayload());
    } catch (JsonProcessingException ex) {
      payload = objectMapper.createObjectNode();
    }
    return new SyncChange(
        record.getCollection(),
        record.getClientId(),
        record.getUpdatedAt(),
        deleted,
        payload
    );
  }

  private String normalizeCollection(String raw) {
    String collection = raw == null ? "" : raw.trim();
    if (!ALLOWED.contains(collection)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "不支持的 collection: " + collection);
    }
    return collection;
  }

  private String writePayload(JsonNode payload) {
    try {
      return objectMapper.writeValueAsString(payload == null ? objectMapper.createObjectNode() : payload);
    } catch (JsonProcessingException ex) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "payload 无法序列化");
    }
  }
}

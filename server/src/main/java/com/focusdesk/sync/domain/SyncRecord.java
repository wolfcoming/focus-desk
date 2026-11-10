package com.focusdesk.sync.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Entity
@Table(
    name = "sync_records",
    uniqueConstraints = @UniqueConstraint(name = "uk_user_collection_client", columnNames = {"user_id", "collection", "client_id"}),
    indexes = {
        @Index(name = "idx_user_updated", columnList = "user_id,updated_at"),
        @Index(name = "idx_user_collection_updated", columnList = "user_id,collection,updated_at")
    }
)
public class SyncRecord {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(nullable = false, length = 40)
  private String collection;

  @Column(name = "client_id", nullable = false, length = 64)
  private String clientId;

  @Lob
  @Column(nullable = false, columnDefinition = "LONGTEXT")
  private String payload;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  @PrePersist
  @PreUpdate
  void touch() {
    if (updatedAt == null) {
      updatedAt = Instant.now();
    }
  }

  public Long getId() { return id; }
  public Long getUserId() { return userId; }
  public void setUserId(Long userId) { this.userId = userId; }
  public String getCollection() { return collection; }
  public void setCollection(String collection) { this.collection = collection; }
  public String getClientId() { return clientId; }
  public void setClientId(String clientId) { this.clientId = clientId; }
  public String getPayload() { return payload; }
  public void setPayload(String payload) { this.payload = payload; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
  public Instant getDeletedAt() { return deletedAt; }
  public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }
}

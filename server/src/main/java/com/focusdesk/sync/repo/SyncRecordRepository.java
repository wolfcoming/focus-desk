package com.focusdesk.sync.repo;

import com.focusdesk.sync.domain.SyncRecord;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SyncRecordRepository extends JpaRepository<SyncRecord, Long> {
  Optional<SyncRecord> findByUserIdAndCollectionAndClientId(Long userId, String collection, String clientId);

  List<SyncRecord> findByUserIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(Long userId, Instant since);

  long countByUserId(Long userId);

  long countByDeletedAtIsNotNull();

  void deleteByUserId(Long userId);

  @Query("select r.collection, count(r) from SyncRecord r group by r.collection order by count(r) desc")
  List<Object[]> countByCollection();

  @Query("select r.userId, count(r) from SyncRecord r group by r.userId")
  List<Object[]> countByUser();

  @Query("""
      select r from SyncRecord r
      where (:userId is null or r.userId = :userId)
        and (:collection is null or :collection = '' or r.collection = :collection)
        and (
          :q is null or :q = ''
          or lower(r.clientId) like lower(concat('%', :q, '%'))
          or lower(r.collection) like lower(concat('%', :q, '%'))
        )
      """)
  Page<SyncRecord> search(
      @Param("userId") Long userId,
      @Param("collection") String collection,
      @Param("q") String q,
      Pageable pageable
  );
}

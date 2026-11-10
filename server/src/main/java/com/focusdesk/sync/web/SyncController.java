package com.focusdesk.sync.web;

import com.focusdesk.sync.security.UserPrincipal;
import com.focusdesk.sync.service.SyncService;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPullResponse;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPushRequest;
import com.focusdesk.sync.web.dto.SyncDtos.SyncPushResponse;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {
  private final SyncService syncService;

  public SyncController(SyncService syncService) {
    this.syncService = syncService;
  }

  @PostMapping("/push")
  SyncPushResponse push(
      @AuthenticationPrincipal UserPrincipal user,
      @Valid @RequestBody SyncPushRequest request
  ) {
    return syncService.push(user.getId(), request);
  }

  @GetMapping("/changes")
  SyncPullResponse changes(
      @AuthenticationPrincipal UserPrincipal user,
      @RequestParam(required = false)
      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
      Instant since
  ) {
    return syncService.pull(user.getId(), since);
  }
}

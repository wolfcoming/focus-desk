package com.focusdesk.sync.web;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class AdminPageController {
  @GetMapping({"/admin", "/admin/"})
  String admin() {
    return "redirect:/admin/index.html";
  }

  @GetMapping(value = "/admin/index.html", produces = MediaType.TEXT_HTML_VALUE)
  ResponseEntity<ClassPathResource> page() {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(new ClassPathResource("static/admin/index.html"));
  }
}

package com.focusdesk.sync.config;

import com.focusdesk.sync.domain.UserAccount;
import com.focusdesk.sync.repo.UserAccountRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AdminBootstrap implements ApplicationRunner {
  private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

  private final UserAccountRepository users;
  private final PasswordEncoder passwordEncoder;
  private final String email;
  private final String password;

  public AdminBootstrap(
      UserAccountRepository users,
      PasswordEncoder passwordEncoder,
      @Value("${app.admin.email:}") String email,
      @Value("${app.admin.password:}") String password
  ) {
    this.users = users;
    this.passwordEncoder = passwordEncoder;
    this.email = email == null ? "" : email.trim().toLowerCase();
    this.password = password == null ? "" : password;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    if (email.isBlank() || password.length() < 8) {
      log.warn("跳过管理员初始化：ADMIN_EMAIL / ADMIN_PASSWORD 未配置或密码短于 8 位");
      return;
    }
    UserAccount user = users.findByEmailIgnoreCase(email).orElse(null);
    if (user == null) {
      user = new UserAccount();
      user.setEmail(email);
      user.setPasswordHash(passwordEncoder.encode(password));
      user.setRole("ADMIN");
      users.save(user);
      log.info("已创建管理员 {}", email);
      return;
    }
    if (!"ADMIN".equals(user.getRole())) {
      user.setRole("ADMIN");
      users.save(user);
      log.info("已把 {} 设为管理员", email);
    }
  }
}

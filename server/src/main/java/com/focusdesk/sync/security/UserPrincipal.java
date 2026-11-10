package com.focusdesk.sync.security;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public class UserPrincipal implements UserDetails {
  private final Long id;
  private final String email;
  private final String passwordHash;
  private final String role;

  public UserPrincipal(Long id, String email, String passwordHash, String role) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.role = role == null || role.isBlank() ? "USER" : role;
  }

  public Long getId() { return id; }

  public String getRole() { return role; }

  @Override
  public Collection<? extends GrantedAuthority> getAuthorities() {
    if ("ADMIN".equals(role)) {
      return List.of(new SimpleGrantedAuthority("ROLE_ADMIN"), new SimpleGrantedAuthority("ROLE_USER"));
    }
    return List.of(new SimpleGrantedAuthority("ROLE_USER"));
  }

  @Override
  public String getPassword() { return passwordHash; }

  @Override
  public String getUsername() { return email; }

  @Override
  public boolean isAccountNonExpired() { return true; }

  @Override
  public boolean isAccountNonLocked() { return true; }

  @Override
  public boolean isCredentialsNonExpired() { return true; }

  @Override
  public boolean isEnabled() { return true; }
}

<template>
  <goa-app-footer>
    <goa-app-footer-nav-section
      slot="nav"
      heading="Resources"
    >
      <a href="https://www.example.com/services">Services</a>
      <a href="https://www.example.com/contact">Contact</a>
      <a href="https://www.example.com/terms">Terms of Use</a>
    </goa-app-footer-nav-section>
    <goa-app-footer-meta-section slot="meta">
      <a href="https://www.example.com/privacy">Privacy</a>
      <a href="https://www.example.com/disclaimer">Disclaimer</a>
      <a href="https://www.example.com/accessibility">Accessibility</a>
    </goa-app-footer-meta-section>
  </goa-app-footer>
</template>

<script setup lang="ts">
/**
 * AppFooter - GoA Design System compliant footer
 *
 * Uses goa-app-footer which automatically provides:
 * - GoA Design System footer logo
 * - Copyright year
 * - Proper styling
 *
 * No custom CSS needed - component is pre-styled.
 */
</script>

<template>
  <v-app-bar
    class="px-6"
    color="primary"
  >
    <v-app-bar-title
      class="ma-0"
    >
      <v-avatar
        size="48"
        class="mr-2"
      >
        <v-img
          src="@/assets/logo.png"
          alt="Logo"
        />
      </v-avatar>

      <span
        class="font-weight-medium"
      >
        NAUTILUS
      </span>
      <span
        class="font-weight-light"
      >
        Command Bridge
      </span>
    </v-app-bar-title>

    <v-btn
      icon="mdi-chart-line"
    />
    <v-btn
      class="ml-2"
      icon="mdi-console"
    />
  </v-app-bar>
</template>

<script lang="ts" setup>
  //
</script>

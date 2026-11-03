import { defineConfig } from 'vite';
import bpmnlint from 'rollup-plugin-bpmnlint';

export default defineConfig({
  plugins: [bpmnlint()],
  build: {
    // bpmn-js is nu eenmaal groot
    chunkSizeWarningLimit: 2500
  }
});

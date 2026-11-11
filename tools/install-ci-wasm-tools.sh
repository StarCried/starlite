#!/usr/bin/env bash
set -euo pipefail
# Ubuntu runner setup shared by CI and candidate preparation.
curl --fail --location --silent --show-error --output "$RUNNER_TEMP/llvm-key" https://apt.llvm.org/llvm-snapshot.gpg.key
test "$(gpg --show-keys --with-colons "$RUNNER_TEMP/llvm-key" | awk -F: '$1 == "fpr" { print $10; exit }')" = "6084F3CF814B57C1CF12EFD515CF4D18AF4F7421"
sudo gpg --dearmor --output /usr/share/keyrings/apt.llvm.org.gpg "$RUNNER_TEMP/llvm-key"
echo "deb [signed-by=/usr/share/keyrings/apt.llvm.org.gpg] https://apt.llvm.org/noble/ llvm-toolchain-noble-20 main" | sudo tee /etc/apt/sources.list.d/llvm-20.list
sudo apt-get update
sudo apt-get install --yes lld-20
curl --fail --location --silent --show-error --output "$RUNNER_TEMP/binaryen.tar.gz" https://github.com/WebAssembly/binaryen/releases/download/version_120/binaryen-version_120-x86_64-linux.tar.gz
echo "ddb097af51d1bdb17300d986b0de7d97422f1933dedb4c9eda3510e0bf4076cc  $RUNNER_TEMP/binaryen.tar.gz" | sha256sum --check
tar -xzf "$RUNNER_TEMP/binaryen.tar.gz" -C "$RUNNER_TEMP"
echo "$RUNNER_TEMP/binaryen-version_120/bin" >> "$GITHUB_PATH"

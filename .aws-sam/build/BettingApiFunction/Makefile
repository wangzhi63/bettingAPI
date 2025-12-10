.PHONY: build-BettingApiFunction

build-BettingApiFunction:
	npm install --production --arch=x64 --platform=linux
	cp -r node_modules $(ARTIFACTS_DIR)/
	cp lambda.js $(ARTIFACTS_DIR)/
	cp -r src $(ARTIFACTS_DIR)/
	cp package.json $(ARTIFACTS_DIR)/

outfile = Perspectives
buildfolder = build
unittest_file = test.html
unittest_source = test/$(unittest_file)
unittest_dest_folder = $(buildfolder)/chrome/content/test
unittest_dest = $(unittest_dest_folder)/$(unittest_file)

.PHONY: plugin

plugin: clean dtds setup
	sh -c "cd $(buildfolder)/ && zip -r ../$(outfile).xpi * -x *\.svn*"
	rm -rf $(buildfolder)

dtds:
	@# remove invalid entity characters as part of the build
	@# 1. we never have to remember to run this step manually
	@# 2. this ensures the plugin won't crash
	@echo Checking for perl...
	@#note: the next few lines use spaces instead of tabs for indentation
	@#just to keep them nicely formatted with the actual commands
    ifeq ($(shell command -v perl ; echo $$?),1)
	    @echo -e "  perl not installed; skipping DTD tests.\n  WARNING: Invalid DTDs may prevent Perspectives from working.\n  Install perl to enable dtd validation."
    else
	    find ./plugin/chrome/locale/ -name "*.dtd" | xargs perl -w checkdtds.pl
    endif

clean:
	rm -f $(outfile).xpi
	rm -rf $(buildfolder)/
	rm -f $(unittest_dest)

setup:
	rm -rf $(buildfolder)/
	mkdir $(buildfolder)
	cp -r plugin/* $(buildfolder)/

test: clean setup install-test-files plugin

install-test-files: setup
	mkdir $(unittest_dest_folder)
	cp $(unittest_source)  $(unittest_dest)

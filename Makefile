outfile = Perspectives.xpi
buildfolder = build
unittest_file = test.html
unittest_source = test/$(unittest_file)
unittest_dest_folder = $(buildfolder)/chrome/content/test
unittest_dest = $(unittest_dest_folder)/$(unittest_file)

.PHONY: plugin

plugin: clean loctests setup
	sh -c "cd $(buildfolder)/ && zip -q -r ../$(outfile) * -x *\.svn*"
	rm -rf $(buildfolder)

test: clean setup install-test-files plugin

clean:
	rm -f $(outfile)
	rm -rf $(buildfolder)/

loctests:
	@# ensure localization files are valid.
	@# note: the next few lines use spaces instead of tabs for indentation
	@# just to keep them nicely formatted with the actual commands
    ifeq ($(shell command -v python ; echo $$?),1)
	    @echo -e "  python not installed; skipping localization tests.\n  WARNING: Invalid localization files may prevent Perspectives from working.\n  Install python to enable localization validation."
    else
	    python test/extlib/checkloc.py ../../plugin/chrome/locale/
    endif

setup:
	rm -rf $(buildfolder)/
	mkdir $(buildfolder)
	cp -r plugin/* $(buildfolder)/

install-test-files: setup
	mkdir $(unittest_dest_folder)
	cp $(unittest_source)  $(unittest_dest)

install-fx: plugin
	firefox $(outfile)&

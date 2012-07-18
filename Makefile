outfile = Perspectives
buildfolder = build

.PHONY: all

all: clean dtds
	rm -rf $(buildfolder)/
	mkdir $(buildfolder)
	cp -r plugin/* $(buildfolder)/
	sh -c "cd $(buildfolder)/ && zip -r ../$(outfile).xpi * -x *\.svn*"
	rm -rf $(buildfolder)

dtds:
	# remove invalid entity characters as part of the build
	# 1. we never have to remember to run this step manually
	# 2. this ensures the plugin won't crash
	@echo Checking for perl...
	#note: the next few lines use spaces instead of tabs for indentation
	#just to keep them nicely formatted with the actual commands
    ifeq ($(shell command -v perl ; echo $$?),1)
	    @echo -e "  perl not installed; skipping DTD tests.\n  WARNING: Invalid DTDs may prevent Perspectives from working.\n  Install perl to enable dtd validation."
    else
	    find ./plugin/chrome/locale/ -name "*.dtd" | xargs perl -w checkdtds.pl
    endif

clean:
	rm -f $(outfile).xpi
	rm -rf $(buildfolder)/

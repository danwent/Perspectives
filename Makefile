.PHONY: all

all: clean dtds
	rm -rf build/
	mkdir build
	cp -r plugin/* build/
	sh -c "cd build/ && zip -r ../Perspectives.xpi * -x *\.svn*" 
	rm -rf build

dtds:
	# remove invalid entity characters as part of the build
	# 1. we never have to remember to run this step manually
	# 2. this ensures the plugin won't crash
	@echo Checking for perl...
    ifeq ($(shell command -v perl ; echo $$?),1)
	    @echo -e "  perl not installed; skipping DTD tests.\n  WARNING: Invalid DTDs may prevent Perspectives from working.\n  Install perl to enable dtd validation."
    else
	    find ./plugin/chrome/locale/ -name "*.dtd" | xargs perl -w checkdtds.pl
    endif

clean:
	rm -f Perspectives.xpi
	rm -rf build/

all:
	# remove invalid entity characters as part of the build
	# 1. we never have to remember to run this step manually
	# 2. this ensures the plugin won't crash
	find ./plugin/chrome/locale/ -name "*.dtd" | xargs perl -w checkdtds.pl
	rm -rf build/
	mkdir build
	cp -r plugin/* build/
	rm -f Perspectives.xpi
	sh -c "cd build/ && zip -r ../Perspectives.xpi * -x *\.svn*" 
	rm -rf build	


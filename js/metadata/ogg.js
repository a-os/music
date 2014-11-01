/* exported OggMetadata */
'use strict';

var OggMetadata = (function() {
  // Fields that should be stored as integers, not strings
  var INTFIELDS = [
    'tracknum', 'trackcount', 'discnum', 'disccount'
  ];

  // Map ogg field names to metadata property names
  var OGGFIELDS = {
    title: 'title',
    artist: 'artist',
    album: 'album',
    tracknumber: 'tracknum',
    tracktotal: 'trackcount',
    discnumber: 'discnum',
    disctotal: 'disccount'
  };

  function EndOfPageError() {}

  function parse(blobview, metadata) {
    readIdentificationHeader(blobview);
    return readCommentHeader(blobview, metadata);
  }

  function readIdentificationHeader(page) {
    var header = readPageHeader(page);
    if (header.segment_table.length !== 1) {
      throw new Error(
        'ogg identification header expected as only packet of first page'
      );
    }
    // Skip over the identification header.
    page.advance(header.segment_table[0]);
  }

  function readCommentHeader(page, metadata) {
    var header = readPageHeader(page);

    var sum = function(a, b) { return a + b; };
    var comment_length = Array.reduce(header.segment_table, sum, 0);

    return new Promise(function(resolve, reject) {
      page.getMore(page.index, comment_length, function(fullpage, err) {
        if (err) {
          reject(err);
          return;
        }

        // Look for a comment header from a supported codec
        var first_byte = fullpage.readByte();
        var valid = false;
        switch (first_byte) {
        case 3:
          valid = fullpage.readASCIIText(6) === 'vorbis';
          metadata.tag_format = 'vorbis';
          break;
        case 79:
          valid = fullpage.readASCIIText(7) === 'pusTags';
          metadata.tag_format = 'opus';
          break;
        }
        if (!valid) {
          reject('malformed ogg comment packet');
          return;
        }

        readAllComments(fullpage, metadata);
        resolve(metadata);
      });
    });
  }

  function readPageHeader(page) {
    var capture_pattern = page.readASCIIText(4);
    if (capture_pattern !== 'OggS') {
      throw new Error('malformed ogg page header');
    }

    // Skip over some header fields until we reach the page segments.
    page.advance(22);

    var page_segments = page.readUnsignedByte();
    var segment_table = page.readUnsignedByteArray(page_segments);

    return {
      segment_table: segment_table
    };
  }

  function readAllComments(page, metadata) {
    var vendor_string_length = page.readUnsignedInt(true);
    page.advance(vendor_string_length); // skip libvorbis vendor string

    var num_comments = page.readUnsignedInt(true);
    // |metadata| already has some of its values filled in (namely the title
    // field). To make sure we overwrite the pre-filled metadata, but also
    // append any repeated fields from the file, we keep track of the fields
    // we've seen in the file separately.
    var seen_fields = {};
    for (var i = 0; i < num_comments; i++) {
      try {
        var comment = readComment(page);
        if (comment) {
          if (seen_fields.hasOwnProperty(comment.field)) {
            // If we already have a value, append this new one.
            metadata[comment.field] += ' / ' + comment.value;
          } else {
            // Otherwise, just save the single value.
            metadata[comment.field] = comment.value;
            seen_fields[comment.field] = true;
          }
        }
      } catch (e) {
        if (e instanceof EndOfPageError) {
          return;
        }
      }
    }
  }

  function readComment(page) {
    if (page.remaining() < 4) { // 4 bytes for comment-length variable
      // TODO: handle metadata that uses multiple pages
      throw new EndOfPageError();
    }
    var comment_length = page.readUnsignedInt(true);
    if (comment_length > page.remaining()) {
      // TODO: handle metadata that uses multiple pages
      throw new EndOfPageError();
    }

    var comment = page.readUTF8Text(comment_length);
    var equal = comment.indexOf('=');
    if (equal === -1) {
      throw new Error('missing delimiter in comment');
    }

    var fieldname = comment.substring(0, equal).toLowerCase().replace(' ', '');
    var propname = OGGFIELDS[fieldname];
    if (propname) { // Do we care about this field?
      var value = comment.substring(equal + 1);
      if (INTFIELDS.indexOf(propname) !== -1) {
        value = parseInt(value, 10);
      }
      return {field: propname, value: value};
    }

    // XXX: Suport album art.
    // http://wiki.xiph.org/VorbisComment
    // http://flac.sourceforge.net/format.html#metadata_block_picture
  }

  return {
    parse: parse
  };
})();

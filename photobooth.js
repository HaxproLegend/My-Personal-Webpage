const photoArchive = [{
  title: "Light study",
  image: "assets/photobooth/IMG_8290-2-preview.jpg",
  original: "assets/IMG_8290-2.jpg",
  dimensions: "6000 × 4000 px",
  caption: "A frame from the archive. Camera settings are read from the image’s embedded EXIF metadata.",
  tint: "#333b2c",
}];

(() => {
  const photoImage = document.getElementById("photo-image");
  if (!photoImage) return;

  const photoSection = document.getElementById("photobooth");
  const photoFrame = document.getElementById("photo-frame");
  const photoDates = document.getElementById("photo-dates");
  const photoSettings = document.getElementById("photo-settings");
  const photoExtraSettings = document.getElementById("photo-extra-settings");
  const photoStatus = document.getElementById("photo-meta-status");
  const fullscreenButton = document.getElementById("photo-fullscreen");
  const fullscreenLabel = fullscreenButton.querySelector(".photo-fullscreen-label");
  let photoPointer = 0;
  let activeRequest = 0;

  function readIfd(view, tiffOffset, relativeOffset, littleEndian) {
    const directoryOffset = tiffOffset + relativeOffset;
    const entryCount = view.getUint16(directoryOffset, littleEndian);
    if (entryCount > 2048) throw new Error("The image contains an invalid EXIF directory.");
    const tags = new Map();
    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = directoryOffset + 2 + index * 12;
      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);
      const typeSize = typeSizes[type];
      if (!typeSize || !count || count > 4096) continue;

      const byteLength = typeSize * count;
      const valueOffset = byteLength <= 4
        ? entryOffset + 8
        : tiffOffset + view.getUint32(entryOffset + 8, littleEndian);
      if (valueOffset < 0 || valueOffset + byteLength > view.byteLength) continue;

      if (type === 2) {
        const bytes = new Uint8Array(view.buffer, valueOffset, count);
        tags.set(tag, new TextDecoder().decode(bytes).replace(/\0+$/, "").trim());
        continue;
      }

      const values = [];
      for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
        const offset = valueOffset + valueIndex * typeSize;
        if (type === 1 || type === 7) values.push(view.getUint8(offset));
        else if (type === 3) values.push(view.getUint16(offset, littleEndian));
        else if (type === 4) values.push(view.getUint32(offset, littleEndian));
        else if (type === 9) values.push(view.getInt32(offset, littleEndian));
        else if (type === 5 || type === 10) {
          const numerator = type === 10
            ? view.getInt32(offset, littleEndian)
            : view.getUint32(offset, littleEndian);
          const denominator = type === 10
            ? view.getInt32(offset + 4, littleEndian)
            : view.getUint32(offset + 4, littleEndian);
          values.push(denominator ? numerator / denominator : null);
        }
      }
      tags.set(tag, count === 1 ? values[0] : values);
    }

    return tags;
  }

  function readExif(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return new Map();

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2 || offset + segmentLength + 2 > view.byteLength) break;

      const payloadOffset = offset + 4;
      const isExif = marker === 0xe1
        && segmentLength >= 8
        && view.getUint8(payloadOffset) === 0x45
        && view.getUint8(payloadOffset + 1) === 0x78
        && view.getUint8(payloadOffset + 2) === 0x69
        && view.getUint8(payloadOffset + 3) === 0x66
        && view.getUint8(payloadOffset + 4) === 0
        && view.getUint8(payloadOffset + 5) === 0;

      if (isExif) {
        const tiffOffset = payloadOffset + 6;
        const byteOrder = view.getUint16(tiffOffset, false);
        const littleEndian = byteOrder === 0x4949;
        if (!littleEndian && byteOrder !== 0x4d4d) return new Map();
        if (view.getUint16(tiffOffset + 2, littleEndian) !== 42) return new Map();

        const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
        const imageTags = readIfd(view, tiffOffset, firstIfdOffset, littleEndian);
        const exifIfdOffset = imageTags.get(0x8769);
        if (typeof exifIfdOffset === "number" && exifIfdOffset > 0) {
          for (const [tag, value] of readIfd(view, tiffOffset, exifIfdOffset, littleEndian)) {
            imageTags.set(tag, value);
          }
        }
        return imageTags;
      }

      offset += segmentLength + 2;
    }

    return new Map();
  }

  function firstValue(tags, ...ids) {
    for (const id of ids) {
      const value = tags.get(id);
      if (value !== undefined && value !== null && value !== "") {
        return Array.isArray(value) ? value[0] : value;
      }
    }
    return null;
  }

  function formatDate(value) {
    const match = typeof value === "string" && value.match(/^(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return value || null;
    const [, year, month, day, hour = "00", minute = "00"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
      .toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function formatNumber(value, digits = 1) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Number(value.toFixed(digits)).toString();
  }

  function formatShutter(value) {
    if (typeof value !== "number" || value <= 0) return null;
    if (value >= 1) return `${formatNumber(value)} s`;
    return `1/${Math.round(1 / value)} s`;
  }

  function formatEv(value) {
    const number = formatNumber(value);
    if (number === null) return null;
    return `${value > 0 ? "+" : ""}${number} EV`;
  }

  function formatWhiteBalance(value) {
    return ({ 0: "Auto", 1: "Manual" })[value] ?? null;
  }

  function formatMetering(value) {
    return ({
      0: "Unknown",
      1: "Average",
      2: "Center-weighted average",
      3: "Spot",
      4: "Multi-spot",
      5: "Pattern",
      6: "Partial",
      255: "Other",
    })[value] ?? null;
  }

  function formatExposureProgram(value) {
    return ({
      0: "Not defined",
      1: "Manual",
      2: "Program auto",
      3: "Aperture priority",
      4: "Shutter priority",
      5: "Creative program",
      6: "Action program",
      7: "Portrait mode",
      8: "Landscape mode",
    })[value] ?? null;
  }

  function cameraSettings(tags, photo) {
    const make = firstValue(tags, 0x010f);
    const model = firstValue(tags, 0x0110);
    const camera = model && make && String(model).toLowerCase().startsWith(String(make).toLowerCase())
      ? String(model)
      : [make, model].filter(Boolean).join(" ");
    const aperture = firstValue(tags, 0x829d);
    const shutter = firstValue(tags, 0x829a);
    const focalLength = firstValue(tags, 0x920a);
    const iso = firstValue(tags, 0x8827, 0x8833, 0x8832);
    const flash = firstValue(tags, 0x9209);
    const width = firstValue(tags, 0xa002, 0x0100);
    const height = firstValue(tags, 0xa003, 0x0101);
    const dimensions = photo.dimensions || (width && height ? `${width} × ${height} px` : null);
    const artist = firstValue(tags, 0x013b);
    const copyright = firstValue(tags, 0x8298);

    return [
      ["Camera", camera],
      ["Lens", firstValue(tags, 0xa434, 0xa432)],
      ["Focal length", typeof focalLength === "number" ? `${formatNumber(focalLength)} mm` : null],
      ["Aperture", typeof aperture === "number" ? `f/${formatNumber(aperture)}` : null],
      ["Shutter speed", formatShutter(shutter)],
      ["ISO", iso ? `ISO ${iso}` : null],
      ["Captured", formatDate(firstValue(tags, 0x9003, 0x0132))],
      ["Image size", dimensions],
      ["Exposure compensation", formatEv(firstValue(tags, 0x9204))],
      ["Exposure program", formatExposureProgram(firstValue(tags, 0x8822))],
      ["White balance", formatWhiteBalance(firstValue(tags, 0xa403))],
      ["Metering", formatMetering(firstValue(tags, 0x9207))],
      ["Flash", typeof flash === "number" ? (flash & 1 ? "Fired" : "Did not fire") : null],
    ];
  }

  function renderSettings(tags, photo) {
    const fields = cameraSettings(tags, photo);
    [photoSettings, photoExtraSettings].forEach((list, listIndex) => {
      list.replaceChildren();
      const listFields = listIndex === 0 ? fields.slice(0, 8) : fields.slice(8);
      listFields.forEach(([label, value]) => {
        const wrapper = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value || "Not recorded in file";
        if (!value) description.classList.add("is-unavailable");
        wrapper.append(term, description);
        list.append(wrapper);
      });
    });

    photoStatus.textContent = tags.size
      ? "Read from embedded EXIF · unavailable fields were not included in this file."
      : "No EXIF camera data found in this image.";
  }

  async function loadPhotoMetadata(photo, requestId) {
    photoStatus.textContent = "Reading camera details from the image…";
    try {
      const response = await fetch(photo.image);
      if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
      const tags = readExif(await response.arrayBuffer());
      if (requestId === activeRequest) renderSettings(tags, photo);
    } catch (error) {
      if (requestId !== activeRequest) return;
      photoSettings.replaceChildren();
      photoExtraSettings.replaceChildren();
      photoStatus.textContent = `Camera metadata could not be loaded: ${error.message}`;
    }
  }

  function renderPhoto(index) {
    photoPointer = index;
    const photo = photoArchive[index];
    const requestId = ++activeRequest;
    photoFrame.classList.add("is-changing");
    photoImage.src = photo.image;
    photoImage.alt = photo.title;
    document.getElementById("photo-index").textContent = `${String(index + 1).padStart(2, "0")} / ${String(photoArchive.length).padStart(2, "0")}`;
    document.getElementById("photo-title").textContent = photo.title;
    document.getElementById("photo-caption").textContent = photo.caption;
    document.getElementById("photo-date").textContent = "Reading capture date…";
    photoSection.style.setProperty("--photo-tint", photo.tint);
    photoDates.querySelectorAll("button").forEach((button, buttonIndex) => {
      button.classList.toggle("is-active", buttonIndex === index);
      if (buttonIndex === index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    window.setTimeout(() => photoFrame.classList.remove("is-changing"), 180);
    loadPhotoMetadata(photo, requestId).then(() => {
      if (requestId !== activeRequest) return;
      const tags = photoSettings.querySelectorAll("div");
      const captured = [...tags].find((item) => item.querySelector("dt")?.textContent === "Captured")?.querySelector("dd")?.textContent;
      document.getElementById("photo-date").textContent = captured && captured !== "Not recorded in file" ? captured : "Capture date unavailable";
    });
  }

  photoArchive.forEach((photo, index) => {
    const button = document.createElement("button");
    const thumbnail = document.createElement("img");
    const label = document.createElement("span");
    button.type = "button";
    button.className = "photobooth-thumb";
    button.setAttribute("aria-label", `View ${photo.title}`);
    thumbnail.src = photo.image;
    thumbnail.alt = "";
    label.textContent = String(index + 1).padStart(2, "0");
    button.append(thumbnail, label);
    button.addEventListener("click", () => renderPhoto(index));
    photoDates.append(button);
  });

  document.getElementById("photo-prev").addEventListener("click", () => {
    renderPhoto((photoPointer - 1 + photoArchive.length) % photoArchive.length);
  });
  document.getElementById("photo-next").addEventListener("click", () => {
    renderPhoto((photoPointer + 1) % photoArchive.length);
  });
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === photoFrame) {
        await document.exitFullscreen();
      } else {
        await photoFrame.requestFullscreen();
      }
    } catch (error) {
      photoStatus.textContent = `Fullscreen could not be opened: ${error.message}`;
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = document.fullscreenElement === photoFrame;
    const photo = photoArchive[photoPointer];
    fullscreenLabel.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit fullscreen view" : "View photograph fullscreen");
    photoImage.src = isFullscreen ? photo.original : photo.image;
  });

  renderPhoto(0);
})();

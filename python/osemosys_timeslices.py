"""
OSeMOSYS timeslice aggregation and broadcast.

Maps hourly TEMPO timeseries ↔ OSeMOSYS timeslice representation.

Public API:
    aggregate(hourly_series, scheme) -> (slices_df, year_split)
    broadcast(slices_df, year_split, scheme, n_hours) -> hourly_series
    default_scheme() -> dict
    slice_labels(scheme) -> list[str]

Scheme dict:
    {
        "seasons":   int,   # number of season bins (default 4)
        "dayBlocks": int,   # number of day-parts per season (default 3)
    }

Slice labels use the convention  "s{season_idx}d{dayblock_idx}"  (1-indexed).
Example for 4×3: s1d1, s1d2, s1d3, s2d1, … s4d3  (12 slices total).

YearSplit:
    Dict mapping label → fraction of year (sum ≈ 1.0).
    For uniform schemes: each slice = 1 / (seasons * dayBlocks).
    For non-divisible day distributions: the final day-block of each season
    absorbs the remainder hours to ensure the total = 1.

Aggregation:
    Each slice averages the hourly values that fall into it.
    Energy conservation: sum(mean_per_slice * n_hours_in_slice) == sum(hourly).

Broadcast:
    Each hour is filled with the mean of its corresponding slice.
    Recovered energy: sum(broadcast) ≈ sum(hourly) (mean-preserving).
"""

from __future__ import annotations

import math


def default_scheme() -> dict:
    return {"seasons": 4, "dayBlocks": 3}


def slice_labels(scheme: dict) -> list:
    """Return ordered list of slice label strings for the given scheme."""
    seasons = int(scheme.get("seasons", 4))
    day_blocks = int(scheme.get("dayBlocks", 3))
    if seasons < 1 or day_blocks < 1:
        raise ValueError(f"seasons and dayBlocks must be >= 1 (got {seasons}, {day_blocks})")
    return [f"s{s}d{d}" for s in range(1, seasons + 1) for d in range(1, day_blocks + 1)]


def _assign_slices(n_hours: int, seasons: int, day_blocks: int) -> list:
    """
    Return a list of length n_hours where each entry is a slice label.

    Hours are first divided into seasons (contiguous blocks of equal size,
    with any remainder absorbed into the last season), then each season's
    hours are divided into day-blocks using daily 24-hour cycles.
    """
    labels = []
    hours_per_season_base = n_hours // seasons
    remainder_seasons = n_hours % seasons

    hour = 0
    for s in range(1, seasons + 1):
        # Last seasons absorb extra hours from non-divisible splits
        season_hours = hours_per_season_base + (1 if s > seasons - remainder_seasons else 0)

        # Day-block assignment uses hour-of-day modulo 24 within the season
        hours_per_block = 24 // day_blocks
        block_remainder = 24 % day_blocks

        for h in range(season_hours):
            hour_of_day = h % 24
            # Assign hour_of_day to a day-block
            d = 1
            boundary = 0
            for db in range(1, day_blocks + 1):
                block_size = hours_per_block + (1 if db <= block_remainder else 0)
                boundary += block_size
                if hour_of_day < boundary:
                    d = db
                    break
            labels.append(f"s{s}d{d}")
        hour += season_hours

    return labels


def aggregate(hourly_series: list, scheme: dict | None = None) -> tuple:
    """
    Aggregate an hourly timeseries into OSeMOSYS timeslice representation.

    Parameters
    ----------
    hourly_series : list of float
        Hourly values (arbitrary length; typically 8760 for a full year).
    scheme : dict, optional
        {"seasons": int, "dayBlocks": int}. Defaults to 4×3.

    Returns
    -------
    slices_df : dict   {label: float}  mean value per slice
    year_split : dict  {label: float}  fraction of total hours per slice
    """
    if scheme is None:
        scheme = default_scheme()
    seasons = int(scheme.get("seasons", 4))
    day_blocks = int(scheme.get("dayBlocks", 3))
    n_hours = len(hourly_series)
    if n_hours == 0:
        raise ValueError("hourly_series must not be empty")

    assignments = _assign_slices(n_hours, seasons, day_blocks)
    labels = slice_labels(scheme)

    totals: dict = {lbl: 0.0 for lbl in labels}
    counts: dict = {lbl: 0 for lbl in labels}
    for val, lbl in zip(hourly_series, assignments):
        totals[lbl] += float(val)
        counts[lbl] += 1

    slices_df = {lbl: (totals[lbl] / counts[lbl] if counts[lbl] > 0 else 0.0) for lbl in labels}
    year_split = {lbl: counts[lbl] / n_hours for lbl in labels}

    return slices_df, year_split


def broadcast(slices_df: dict, year_split: dict, scheme: dict, n_hours: int) -> list:
    """
    Broadcast timeslice means back to an hourly series of length n_hours.

    Each hour is assigned its slice's mean value. The result preserves
    the slice-mean energy: sum(broadcast) ≈ sum(hourly original) within
    floating-point precision.

    Parameters
    ----------
    slices_df : dict   {label: float}  mean per slice
    year_split : dict  {label: float}  fraction of year (used to infer counts if needed)
    scheme : dict      {"seasons", "dayBlocks"}
    n_hours : int      desired output length

    Returns
    -------
    list of float, length n_hours
    """
    seasons = int(scheme.get("seasons", 4))
    day_blocks = int(scheme.get("dayBlocks", 3))
    assignments = _assign_slices(n_hours, seasons, day_blocks)
    return [slices_df.get(lbl, 0.0) for lbl in assignments]


def year_split_for_n_hours(n_hours: int, scheme: dict) -> dict:
    """
    Compute YearSplit fractions for arbitrary n_hours without a data series.
    Equivalent to calling aggregate([0]*n_hours, scheme)[1].
    """
    seasons = int(scheme.get("seasons", 4))
    day_blocks = int(scheme.get("dayBlocks", 3))
    assignments = _assign_slices(n_hours, seasons, day_blocks)
    labels = slice_labels(scheme)
    counts: dict = {lbl: 0 for lbl in labels}
    for lbl in assignments:
        counts[lbl] += 1
    return {lbl: counts[lbl] / n_hours for lbl in labels}

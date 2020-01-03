import Vector from './Vector';

export interface IField {
  xmin: number; // 一般格点数据是按照矩形范围来切割，所以定义其经纬度范围
  ymin: number;
  xmax: number;
  ymax: number;
  deltaX: number; // x（经度）增量
  deltaY: number; // y（维度）增量
  cols: number; // 列（可由 `(xmax - xmin) / deltaX` 得到）
  rows: number; // 行
  us: number[]; // U分量
  vs: number[]; // V分量
  wrapX: boolean;
}

export default class Field {
  private readonly xmin: number;
  private readonly xmax: number;
  private readonly ymin: number;
  private readonly ymax: number;
  private readonly cols: number;
  private readonly rows: number;
  private grid: any[];
  private us: number[];
  private vs: number[];
  private isContinuous: boolean;
  private deltaY: number;
  private deltaX: number;
  private wrapX: boolean;

  constructor(params: IField) {
    this.grid = [];

    this.xmin = params.xmin;
    this.xmax = params.xmax;

    this.ymin = params.ymin;
    this.ymax = params.ymax;

    this.cols = params.cols;
    this.rows = params.rows;

    this.us = params.us;
    this.vs = params.vs;

    this.deltaX = params.deltaX;
    this.deltaY = params.deltaY;

    const cols = Math.ceil((this.xmax - this.xmin) / params.deltaX);
    const rows = Math.ceil((this.ymax - this.ymin) / params.deltaY);

    if (cols !== this.cols || rows !== this.rows) {
      console.warn('The data grid is not available');
    }

    this.isContinuous = Math.floor(this.cols * params.deltaX) >= 360;
    this.wrapX = params.wrapX;

    this.grid = this.buildGrid();
  }

  public buildGrid() {
    // grid = [];
    // var p = 0;
    // var isContinuous = Math.floor(ni * Δλ) >= 360;
    //
    // for (var j = 0; j < nj; j++) {
    //   var row = [];
    //   for (var i = 0; i < ni; i++, p++) {
    //     row[i] = builder.data(p);
    //   }
    //   if (isContinuous) {
    //     row.push(row[0]);
    //   }
    //   grid[j] = row;
    // }

    let grid = [];
    let p = 0;

    const { rows, cols, us, vs } = this;

    for (let j = 0; j < rows; j++) {
      const row = [];
      for (let i = 0; i < cols; i++, p++) {
        let u = us[p];
        let v = vs[p];
        let valid = this.isValid(u) && this.isValid(v);
        row[i] = valid ? new Vector(u, v) : null;
      }

      if (this.isContinuous) {
        // For wrapped grids, duplicate first column as last column to simplify interpolation logic
        row.push(row[0]);
      }
      grid[j] = row;
    }
    return grid;
  }

  public release() {
    this.grid = [];
  }

  /**
   * grib data extent
   */
  public extent() {
    return [
      this.xmin,
      this.ymin,
      this.xmax,
      this.ymax,
    ]
  }

  /**
   * Bilinear interpolation for Vector
   * https://en.wikipedia.org/wiki/Bilinear_interpolation
   * @param   {Number} x
   * @param   {Number} y
   * @param   {Number[]} g00
   * @param   {Number[]} g10
   * @param   {Number[]} g01
   * @param   {Number[]} g11
   * @returns {Vector}
   */
  private bilinearInterpolateVector(
    x: number, y: number,
    g00: { u: number; v: number; },
    g10: { u: number; v: number; },
    g01: { u: number; v: number; },
    g11: { u: number; v: number; }
  ) {
    const rx = 1 - x;
    const ry = 1 - y;

    const a = rx * ry;
    const b = x * ry;
    const c = rx * y;
    const d = x * y;
    const u = g00.u * a + g10.u * b + g01.u * c + g11.u * d;
    const v = g00.v * a + g10.v * b + g01.v * c + g11.v * d;
    return new Vector(u, v);
  }

  // TODO: 如果支持x方向平铺，范围需要重新计算
  calculateRange() {}

  /**
   * 检查 uv是否合法
   * @param x
   * @private
   */
  public isValid(x: any) {
    return x !== null && x !== undefined;
  }

  public contains(lon: number, lat: number) {
    let longitudeIn = lon >= this.xmin && lon <= this.xmax;
    let latitudeIn = lat >= this.ymin && lat <= this.ymax;
    return longitudeIn && latitudeIn;
  }

  /**
   * 获取经纬度所在的位置索引
   * @param lon
   * @param lat
   */
  public getDecimalIndexes(lon: number, lat: number) {
    if (this.wrapX && lon < this.xmin) {
      lon = lon + 360;
    }
    let i = (lon - this.xmin) / this.deltaX;
    let j = (this.ymax - lat) / this.deltaY;
    return [i, j];
  }

  /**
   * Nearest value at lon-lat coordinates
   * @param lon
   * @param lat
   */
  public valueAt(lon: number, lat: number) {

    if (!this.contains(lon, lat)) return null;

    const indexes = this.getDecimalIndexes(lon, lat);
    let value = this.valueAtIndexes(indexes[0], indexes[1]);
    return new Vector(value[0], value[1]);
  }

  public hasValueAt(lon: number, lat: number) {
    let value = this.valueAt(lon, lat);
    const hasValue = value !== null;
    let included = true;
    return hasValue && included;
  }

  // var interpolate = function (λ, φ) {
  //
  //   if (!grid) return null;
  //
  //   var i = floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
  //   var j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90
  //
  //   var fi = Math.floor(i), ci = fi + 1;
  //   var fj = Math.floor(j), cj = fj + 1;
  //
  //   var row;
  //   if ((row = grid[fj])) {
  //     var g00 = row[fi];
  //     var g10 = row[ci];
  //     if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
  //       var g01 = row[fi];
  //       var g11 = row[ci];
  //       if (isValue(g01) && isValue(g11)) {
  //         // All four points found, so interpolate the value.
  //         return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
  //       }
  //     }
  //   }
  //   return null;
  // };

  private interpolatePoint(i: number, j: number) {
    //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
    //        fi  i   ci          four points 'G' that enclose point (i, j). These points are at the four
    //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
    //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
    //    j ___|_ .   |           (1, 9) and (2, 9).
    //  =8.3   |      |
    //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
    //         |      |           column, so the index ci can be used without taking a modulo.
    const indexes = this.getFourSurroundingIndexes(i, j);
    const [fi, ci, fj, cj] = indexes;
    let values = this.getFourSurroundingValues(fi, ci, fj, cj);
    if (values) {
      values = values.map((v) => new Vector(v[0], v[1]));

      if (values) {
        const [g00, g10, g01, g11] = values;
        return this.bilinearInterpolateVector(i - fi, j - fj, g00, g10, g01, g11);
      }
    }

    return null;
  }

  /**
   * Check the column index is inside the field,
   * adjusting to min or max when needed
   * @private
   * @param   {Number} ii - index
   * @returns {Number} i - inside the allowed indexes
   */
  private clampColumnIndex(ii: number) {
    let i = ii;
    if (ii < 0) {
      i = 0;
    }
    let maxCol = this.cols - 1;
    if (ii > maxCol) {
      i = maxCol;
    }
    return i;
  }

  /**
   * Check the row index is inside the field,
   * adjusting to min or max when needed
   * @private
   * @param   {Number} jj index
   * @returns {Number} j - inside the allowed indexes
   */
  private clampRowIndex(jj: number) {
    let j = jj;
    if (jj < 0) {
      j = 0;
    }
    let maxRow = this.rows - 1;
    if (jj > maxRow) {
      j = maxRow;
    }
    return j;
  }

  /**
   * Get surrounding indexes (integer), clampling on borders
   * @private
   * @param   {Number} i - decimal index
   * @param   {Number} j - decimal index
   * @returns {Array} [fi, ci, fj, cj]
   */
  private getFourSurroundingIndexes(i: number, j: number) {
    let fi = Math.floor(i);
    let ci = fi + 1;
    // duplicate colum to simplify interpolation logic (wrapped value)
    if (this.isContinuous && ci >= this.cols) {
      ci = 0;
    }
    ci = this.clampColumnIndex(ci);

    let fj = this.clampRowIndex(Math.floor(j));
    let cj = this.clampRowIndex(fj + 1);

    return [fi, ci, fj, cj];
  }

  /**
   * Get four surrounding values or null if not available,
   * from 4 integer indexes
   * @private
   * @param   {Number} fi
   * @param   {Number} ci
   * @param   {Number} fj
   * @param   {Number} cj
   * @returns {Array}
   */
  private getFourSurroundingValues(fi: number, ci: number, fj: number, cj: number) {
    let row;
    if ((row = this.grid[fj])) {
      // upper row ^^
      const g00 = row[fi]; // << left
      const g10 = row[ci]; // right >>
      if (
        this.isValid(g00) &&
        this.isValid(g10) &&
        (row = this.grid[cj])
      ) {
        // lower row vv
        const g01 = row[fi]; // << left
        const g11 = row[ci]; // right >>
        if (this.isValid(g01) && this.isValid(g11)) {
          return [g00, g10, g01, g11]; // 4 values found!
        }
      }
    }
    return null;
  }

  /**
   * Value for grid indexes
   * @param   {Number} i - column index (integer)
   * @param   {Number} j - row index (integer)
   * @returns {Vector|Number}
   */
  public valueAtIndexes(i: number, j: number) {
    if (!this.grid) return null;
    // @ts-ignore
    return this.grid[j][i]; // <-- j,i !!
  }

  /**
   * Lon-Lat for grid indexes
   * @param   {Number} i - column index (integer)
   * @param   {Number} j - row index (integer)
   * @returns {Number[]} [lon, lat]
   */
  public lonLatAtIndexes(i: number, j: number) {
    let lon = this.longitudeAtX(i);
    let lat = this.latitudeAtY(j);

    return [lon, lat];
  }

  /**
   * Longitude for grid-index
   * @param   {Number} i - column index (integer)
   * @returns {Number} longitude at the center of the cell
   */
  private longitudeAtX(i: number) {
    let halfXPixel = this.deltaX / 2.0;
    let lon = this.xmin + halfXPixel + i * this.deltaX;
    if (this.wrapX) {
      lon = lon > 180 ? lon - 360 : lon;
    }
    return lon;
  }

  /**
   * Latitude for grid-index
   * @param   {Number} j - row index (integer)
   * @returns {Number} latitude at the center of the cell
   */
  private latitudeAtY(j: number) {
    let halfYPixel = this.deltaY / 2.0;
    return this.ymax - halfYPixel - j * this.deltaY;
  }

  public randomize(o: any = {}) {

    // field.randomize = function (o) {  // UNDONE: this method is terrible
    //   var x, y;
    //   var safetyNet = 0;
    //   do {
    //     x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
    //     y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y)
    //   } while (field(x, y)[2] === null && safetyNet++ < 30);
    //   o.x = x;
    //   o.y = y;
    //   return o;
    // };

    let i = (Math.random() * this.cols) | 0;
    let j = (Math.random() * this.rows) | 0;

    o.x = this.longitudeAtX(i);
    o.y = this.latitudeAtY(j);

    return o;
  }
}

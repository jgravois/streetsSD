var sqlBuilder = (function() {
    // Private.

    var fields = {
        "ic": {
            "activity": "ic.type",
            "status": "ic.status",
            "length": "(ic.length / 5280)",
            "width": "ic.width",
            "adj_length": "getSQLString",
            "moratorium": "ic.moratorium",
            "work_start": "ic.start",
            "work_completed": "to_char(ic.moratorium, 'Month YYYY')",
            "work_scheduled": "getSQLString",
            "work_end": "ic.moratorium"
        },
        "tswb": {
            "cartodb_id": "tswb.cartodb_id",
            "the_geom": "tswb.the_geom",
            "the_geom_webmercator": "tswb.the_geom_webmercator",
            "street": "tswb.rd20full",
            "from_street": "tswb.xstrt1",
            "to_street": "tswb.xstrt2"
        },
        "oci2011": {
            "cartodb_id": "oci2011.cartodb_id",
            "the_geom": "oci2011.the_geom",
            "the_geom_webmercator": "oci2011.the_geom_webmercator",
            "oci_date": "oci2011.oci_date",
            "street": "oci2011.street",
            "from_street": "oci2011.from_st",
            "to_street": "oci2011.to_st",
            "oci_condition": "getSQLString",
            "color": "getSQLString",
            "length": "oci2011.length",
            "oci": "oci2011.oci",
            "oci_display": "ROUND(oci2011.oci)"
        },
        "oci2015": {
            "oci": "oci2015.oci",
            "oci_display": "ROUND(oci2015.oci)",
            "oci_condition": "getSQLString",
            "color": "getSQLString",
            "length": "oci2015.length"
        }
    };

    var tables = {
        ic: "sdif_update",
        tswb: "city_street_alley_walkway",
        oci2011: "oci_2011",
        oci2015: "oci_2015"
    };

    getLastQuarter = function() {
        var date = date || new Date();
        var sqlFormatDate = ('YYYY-MM-DD');
        var quarterAdjustment= (moment(date).month() % 3) + 1;
        var lastQuarterEndDate = moment(date).subtract({ months: quarterAdjustment }).endOf('month');
        var lastQuarterStartDate = lastQuarterEndDate.clone().subtract({ months: 3 }).startOf('month');
        return {
            start: lastQuarterStartDate.format(sqlFormatDate),
            end: lastQuarterEndDate.format(sqlFormatDate)
        }
    }

    select = function() {
        return squel.select({
            fieldAliasQuoteCharacter: "",
            tableAliasQuoteCharacter: ""
        });
    };

    getSQLString = function(stringRef) {
        switch (stringRef) {
            case "adj_length":
                var widthField = mapAlias("ic", "width");
                var lengthField = mapAlias("ic", "length");
                return "CASE " +
                    "WHEN " + widthField + " >= 50 THEN " +
                    "(" + lengthField + " * 2) " +
                    "ELSE " + lengthField + " " +
                    "END";
            case "oci_condition":
            case "color":
                return "CASE " +
                    "WHEN oci <= 39.999 THEN 'Poor' " +
                    "WHEN oci <= 69.999 THEN 'Fair' " +
                    "ELSE 'Good' " +
                    "END";

            case "work_scheduled":
                var schedField = mapAlias("ic", "work_start");
                return "CASE " +
                    "WHEN EXTRACT (MONTH FROM  " + schedField + ") >= 7 " +
                    "THEN 'FY-' || EXTRACT (YEAR FROM " + schedField + ") + 1 " +
                    "ELSE 'FY-' || EXTRACT (YEAR FROM " + schedField + ") " +
                    "END";

            default:
                throw new Error("Unfound getSQLString " + stringRef);
        }
    };

    mapAlias = function(table_alias, field_alias) {
        // Check if table exists.
        if (_.indexOf(_.keys(tables), table_alias) === -1)
            throw new Error("No Table " + table_alias)

        // If table exists, and no field_alias, return table alias.
        if (_.isUndefined(field_alias))
            return tables[table_alias];

        // If table exists, and no field found, throw error.
        if (_.isUndefined(fields[table_alias][field_alias]))
            throw new Error("Unfound Table " + table_alias + " Field " + field_alias)

        // HACK - @TODO
        if (fields[table_alias][field_alias] === "getSQLString")
            return getSQLString(field_alias)


        return fields[table_alias][field_alias];
    };

    getTableSQL = function(sqlKey) {
        var SQL = select()
        if (sqlKey == 'oci-2011') {
            _.each(fields.oci2011, function(element, index) {
                SQL.field(mapAlias("oci2011", index), index)
            });
            SQL.from(mapAlias("oci2011"), "oci2011")
        }
        else if (sqlKey == 'oci-2015') {
            _.each(fields.oci2015, function(element, index) {
                SQL.field(mapAlias("oci2015", index), index)
            });
            _.each(fields.tswb, function(element, index) {
                SQL.field(mapAlias("tswb", index), index)
            });
            SQL.from(mapAlias("oci2015"), "oci2015")
               .join(tables.tswb, "tswb", "oci2015.segment = tswb.sapid")
        }
        else {
            _.each(fields.ic, function(element, index) {
                SQL.field(mapAlias("ic", index), index)
            });
            _.each(fields.tswb, function(element, index) {
                SQL.field(mapAlias("tswb", index), index)
            });
            SQL.from(tables.ic, "ic")
               .join(tables.tswb, "tswb", "ic.segment = tswb.sapid")


        }

        return SQL;
    };

    getConditionSQL = function(sqlKey, SQL) {
        var lastQuarter = getLastQuarter();
        switch (sqlKey) {
            case 'all-work':
                SQL.where(mapAlias("ic", "work_end") + " is not null")
                   .where(mapAlias("ic", "status") + " = 'Moratorium'")
                   .where(mapAlias("ic", "work_end") + "::date >= '2013-07-01'")
                   .where(mapAlias("ic", "work_end") + "::date <= '" + lastQuarter.end + "'")
                break;

            case 'work-1k-pledge':
                SQL.where(mapAlias("ic", "work_end") + " is not null")
                   .where(mapAlias("ic", "status") + " = 'Moratorium'")
                   .where(mapAlias("ic", "work_end") + "::date >= '2015-07-01'")
                   .where(mapAlias("ic", "work_end") + "::date <= '" + lastQuarter.end + "'")
                break;

            case 'work-fy-2014':
                SQL.where(mapAlias("ic", "work_end") + " is not null")
                   .where(mapAlias("ic", "status") + " = 'Moratorium'")
                   .where(mapAlias("ic", "work_end") + "::date >= '2013-07-01'")
                   .where(mapAlias("ic", "work_end") + "::date <= '2014-06-30'")
                break;

            case 'work-fy-2015':
                SQL.where(mapAlias("ic", "work_end") + " is not null")
                   .where(mapAlias("ic", "status") + " = 'Moratorium'")
                   .where(mapAlias("ic", "work_end") + "::date >= '2014-07-01'")
                   .where(mapAlias("ic", "work_end") + "::date <= '2015-06-30'")
                break;

            case 'work-fy-2016':
                SQL.where(mapAlias("ic", "work_end") + " is not null")
                   .where(mapAlias("ic", "status") + " = 'Moratorium'")
                   .where(mapAlias("ic", "work_end") + "::date >= '2015-07-01'")
                   .where(mapAlias("ic", "work_end") + "::date <= '" + lastQuarter.end + "'")
                break;

            case 'work-fy-2017':
                SQL.where(mapAlias("ic", "work_end") + " is not null")
                   .where(mapAlias("ic", "status") + " = 'Moratorium'")
                   .where(mapAlias("ic", "work_end") + "::date >= '2016-04-01'")
                   .where(mapAlias("ic", "work_end") + "::date <= '" + lastQuarter.end + "'")
                break;

            case 'future-work':
                SQL.where(mapAlias("ic", "work_end") + " is null")
                   .where(mapAlias("ic", "status") + " = 'Planning' OR " +
                    mapAlias("ic", "status") + " = 'Awarding' OR " +
                    mapAlias("ic", "status") + " = 'Construction'")
                break;

            case "oci-2011":
                SQL.where("oci_date is not null")
                   .where("oci > 0")
                   .where("oci_date::date <= '2012-01-01'");
                break;

            case "oci-2015":
                SQL.where("oci > 0")
                break;
        }

        return SQL;
    };

    getDistanceSQL = function(sqlKey, config) {
        var SQL = select();
        var groupField = "";
        var joinTable = "";

        if (config.groupFieldSQL)
            groupField = config.groupFieldSQL;

        // Determine Grouping Field.
        // Throw error if no table found will happen in map alias.
        if (config.groupFieldAlias)
            groupField = mapAlias(config.tableAlias, config.groupFieldAlias);

        SQL.field(groupField, config.groupFieldAlias)
           .field("SUM(" + mapAlias(config.tableAlias, config.lengthFieldAlias) + ")", "totalMiles")
           .group(groupField);

        if (sqlKey == 'oci-2011')
            SQL.from(mapAlias("oci2011"), "oci2011")
        if (sqlKey == 'oci-2015')
            SQL.from(mapAlias("oci2015"), "oci2015")

        // All others
        else {
            SQL.from(mapAlias("ic"), "ic")
               .join(mapAlias("tswb"), "tswb", "ic.segment = tswb.sapid")
        }

        if (config.order)
            SQL.order(groupField, config.order == "ASC");

        return SQL;

    };

    getOCICalcSQL = function(sqlKey, calc) {
        var SQL = select();
        if (calc == 'avg')  {
            var ociField = mapAlias("oci2011", "oci");
            var lengthField = mapAlias("oci2011", "length");

            SQL.field("SUM(OCI * LENGTH) / SUM(LENGTH)", "avg")
        }


        SQL.from(mapAlias("oci2011"), "oci2011");

        return SQL;
    }


    // Public API
    return {
        getSQL: function(sqlKey) {
            var SQL = getTableSQL(sqlKey);
            // Apply conditions as Needed.
            return getConditionSQL(sqlKey, SQL).toString();
        },
        getLastQuarter: function(date) {
            return getLastQuarter(date);
        },

        getDistanceSQL: function(sqlKey, config) {
            var SQL = getDistanceSQL(sqlKey, config);
            // Apply conditions as Needed.
            SQL = getConditionSQL(sqlKey, SQL).toString();

            return SQL;
        },

        mapAlias: function(table_alias, field_alias) {
            return mapAlias(table_alias, field_alias);
        },

        getOCICalcSQL: function(sqlKey, calc) {
            var SQL = getOCICalcSQL(sqlKey, calc);
            SQL = getConditionSQL(sqlKey, SQL).toString();
            return SQL;
        }

    };
})();

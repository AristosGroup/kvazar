Template.dashboardLayout.rendered = function () {
    $(function () {


        var reports = Reports.find();
        var data = [];
        reports.forEach(function (item) {
            data.push({id: item._id, name: item.title, y: item.value});
        });

        $('#chart').highcharts({
                chart: {
                    plotBackgroundColor: null,
                    plotBorderWidth: null,
                    plotShadow: false
                },
                title: {
                    text: 'Test pie vs reactive meteor collection'
                },
                tooltip: {
                    pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
                },
                plotOptions: {
                    pie: {
                        allowPointSelect: true,
                        cursor: 'pointer',
                        dataLabels: {
                            enabled: true,
                            color: '#000000',
                            connectorColor: '#000000',
                            format: '<b>{point.name}</b>: {point.percentage:.1f} %'
                        }
                    }
                },
                series: [
                    {
                        type: 'pie',
                        name: 'report value',
                        data: data
                    }
                ]
            },

            function (chart) {
                if (!chart.renderer.forExport) {

                    reports.observeChanges({
                        added: function (id, row) {
                            var serie = chart.series[0];
                            //   shift = ser.data.length > 20; // shift if the series is
                            // longer than 20

                            // add the point
                            serie.addPoint([row.title, row.value], true);
                        },

                        changed: function (id, row) {

                            var point = _.find(chart.series[0].points, function (point) {
                                return point.id == id;
                            });


                            point.update(row.value);
                        },

                        removed: function (id) {
                            var point = _.find(chart.series[0].points, function (point) {
                                return point.id == id;
                            });

                            point.remove(false, false);
                        }
                    });
                }
            });


    });
};